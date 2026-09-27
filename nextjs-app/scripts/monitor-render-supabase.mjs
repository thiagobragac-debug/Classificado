#!/usr/bin/env node
// Monitor de saúde do Render (tauze-class) + Supabase (Tauze Classificado),
// criado depois do e-mail de "exceeded its memory limit" do Render
// (26/set/2026) revelar 3 crashes de OOM em ~36h. Roda via scheduled task
// (a cada 1h): notifica na hora quando acha algo novo, e PERSISTE tudo em
// duas tabelas (system_health_samples, render_events_log) pra alimentar o
// dashboard em /admin/monitoramento -- sem isso, cada checagem só existia
// como notificação pontual, sem histórico consultável.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(__dirname, 'tmp-monitor-state.json');

function getEnv(key) {
  const envText = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) throw new Error(`missing ${key} em .env.local`);
  return m[1].trim();
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastRenderEventTimestamp: null, lastRenderEventId: null };
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Limite documentado do plano Free do Supabase (Database size) -- confirmar
// em supabase.com/pricing se este script disparar um alerta de espaço um
// dia; o valor pode mudar com o tempo e não há endpoint de API pra
// consultá-lo diretamente (confirmado: /v1/projects/{ref}/usage não existe).
const SUPABASE_FREE_DB_LIMIT_BYTES = 500 * 1024 * 1024;
const SUPABASE_DB_WARN_RATIO = 0.8; // avisa em 80% do limite, não só ao estourar

const PROJECT_REF = 'rfzuzuobwuanmbrcthqe';
const PROD_HEALTH_URL = 'https://www.tauzeclass.com.br/api/health';

// service-role key -- só este script escreve nas tabelas de monitoramento
// (bypassa RLS de propósito); anon/authenticated nunca têm policy de
// escrita nelas (ver migration 20260927120000).
function adminClient() {
  return createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

async function checkRender(db) {
  const API_KEY = getEnv('RENDER_API_KEY');
  const SERVICE_ID = getEnv('RENDER_SERVICE_ID');

  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/events?limit=50`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    return { ok: false, findings: [`Falha consultando eventos do Render: HTTP ${res.status}`] };
  }
  const events = await res.json();

  const state = loadState();
  const lastSeen = state.lastRenderEventTimestamp ? new Date(state.lastRenderEventTimestamp) : null;

  // API devolve mais recente primeiro.
  const newest = events[0]?.event;
  const findings = [];
  const toPersist = [];

  for (const { event } of events) {
    const ts = new Date(event.timestamp);
    if (lastSeen && ts <= lastSeen) break; // já visto (ou mais antigo) -- resto também já foi visto

    // Persiste todo evento relevante pra timeline (não só falhas) -- deploys
    // dão contexto de "o que mudou perto de quando algo quebrou".
    if (['server_failed', 'server_available', 'deploy_ended', 'deploy_started'].includes(event.type)) {
      toPersist.push(event);
    }

    if (event.type === 'server_failed') {
      const oom = event.details?.reason?.oomKilled;
      const evicted = event.details?.reason?.evicted;
      if (oom) {
        findings.push(`OOM (falta de memória, limite ${oom.memoryLimit}) em ${event.timestamp}`);
      } else if (evicted) {
        findings.push(`Instância removida (evicted) em ${event.timestamp}`);
      } else {
        findings.push(`server_failed em ${event.timestamp} (motivo: ${JSON.stringify(event.details?.reason || {})})`);
      }
    }
  }

  if (toPersist.length > 0 && db) {
    const rows = toPersist.map((event) => ({
      render_event_id: event.id,
      event_type: event.type,
      occurred_at: event.timestamp,
      details: event.details || {},
    }));
    const { error } = await db.from('render_events_log').upsert(rows, { onConflict: 'render_event_id' });
    if (error) findings.push(`Aviso: falha salvando eventos no Supabase: ${error.message}`);
  }

  if (newest) {
    saveState({ ...state, lastRenderEventTimestamp: newest.timestamp, lastRenderEventId: newest.id });
  }

  return { ok: true, findings, isFirstRun: !lastSeen };
}

async function checkSupabase(db) {
  const ACCESS_TOKEN = getEnv('SUPABASE_ACCESS_TOKEN');
  const findings = [];
  let dbSizeBytes = null;

  const healthRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/health?services=db,auth,rest,storage`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!healthRes.ok) {
    findings.push(`Falha consultando saúde do Supabase: HTTP ${healthRes.status}`);
  } else {
    const health = await healthRes.json();
    for (const svc of health) {
      if (!svc.healthy) findings.push(`Serviço Supabase "${svc.name}" reportando não-saudável: ${svc.status}`);
    }
  }

  const sqlRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select pg_database_size(current_database()) as bytes;' }),
  });
  if (sqlRes.ok) {
    const rows = await sqlRes.json();
    dbSizeBytes = rows[0]?.bytes ?? null;
    if (typeof dbSizeBytes === 'number' && dbSizeBytes > SUPABASE_FREE_DB_LIMIT_BYTES * SUPABASE_DB_WARN_RATIO) {
      const mb = (dbSizeBytes / 1024 / 1024).toFixed(1);
      findings.push(`Banco de dados em ${mb}MB -- acima de ${SUPABASE_DB_WARN_RATIO * 100}% do limite conhecido do plano Free (500MB)`);
    }
  }

  return { ok: true, findings, dbSizeBytes };
}

// Amostra a memória REAL do processo em produção via /api/health (ver
// comentário lá) -- não tem outro jeito de obter isso de graça, já que o
// Render bloqueia o gráfico de memória/CPU atrás de um plano pago.
async function sampleProdMemory(db, dbSizeBytes) {
  const findings = [];
  try {
    const res = await fetch(PROD_HEALTH_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      findings.push(`/api/health em produção respondeu HTTP ${res.status}`);
      return findings;
    }
    const body = await res.json();
    if (!body.memory) return findings; // deploy antigo ainda sem o campo -- não é erro

    if (db) {
      const { error } = await db.from('system_health_samples').insert({
        rss_bytes: body.memory.rss,
        heap_used_bytes: body.memory.heapUsed,
        heap_total_bytes: body.memory.heapTotal,
        uptime_seconds: body.uptimeSeconds,
        db_size_bytes: dbSizeBytes,
      });
      if (error) findings.push(`Aviso: falha salvando amostra de memória: ${error.message}`);
    }

    const rssMb = body.memory.rss / 1024 / 1024;
    if (rssMb > 512 * 0.85) {
      findings.push(`Memória em produção em ${rssMb.toFixed(0)}MB -- perto do limite de 512MB do plano Free`);
    }
  } catch (err) {
    findings.push(`Falha amostrando memória de produção: ${err.message}`);
  }
  return findings;
}

async function main() {
  const db = adminClient();

  const render = await checkRender(db);
  const supabase = await checkSupabase(db);
  const memFindings = await sampleProdMemory(db, supabase.dbSizeBytes);

  const allFindings = [...render.findings, ...supabase.findings, ...memFindings];

  console.log(`=== Monitor Render + Supabase — ${new Date().toISOString()} ===`);
  if (render.isFirstRun) {
    console.log('(primeira execução -- estado inicial gravado, próximas rodadas só reportam eventos NOVOS)');
  }
  if (allFindings.length === 0) {
    console.log('Nada novo. Tudo normal.');
  } else {
    console.log(`${allFindings.length} achado(s):`);
    for (const f of allFindings) console.log(` - ${f}`);
  }

  process.exitCode = allFindings.length > 0 ? 2 : 0;
}

main().catch((err) => {
  console.error('Erro fatal no monitor:', err);
  process.exitCode = 1;
});
