#!/usr/bin/env node
// Consolida numa rodada só as verificações ao vivo que, até agora, viviam
// espalhadas em dezenas de scripts descartáveis (tmp-repro-*.mjs,
// tmp-verify-*.mjs em scripts/) escritos e jogados fora durante auditorias
// de segurança anteriores. Revisão de cobertura de testes (2026-09-26):
// migrations de RLS/rate-limit/audit-log só eram validadas UMA vez, na mão,
// e nunca mais — se alguém reescrever uma policy sem querer (quase
// aconteceu nesta mesma sessão com o with_check de "ads"), nada acusa.
//
// Fora do CI de propósito: exige SUPABASE_ACCESS_TOKEN (lido de .env.local,
// nunca commitado) contra o projeto Supabase real — mesma decisão já
// documentada em vitest.config.mts pra testes de integração/RLS. Rode com:
//   node scripts/verify-security-migrations.mjs
// Uso: reverificação manual antes/depois de qualquer migration que toque
// policies, triggers ou RPCs de segurança.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
function getEnv(key) {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) throw new Error(`missing ${key} em .env.local`);
  return m[1].trim();
}
const ACCESS_TOKEN = getEnv('SUPABASE_ACCESS_TOKEN');
const PROJECT_REF = 'rfzuzuobwuanmbrcthqe';

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SQL falhou (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

let passed = 0;
let failed = 0;
const failures = [];

async function check(label, fn) {
  try {
    const ok = await fn();
    if (ok) {
      passed++;
      console.log(`  OK   ${label}`);
    } else {
      failed++;
      failures.push(label);
      console.log(`  FALHOU ${label}`);
    }
  } catch (err) {
    failed++;
    failures.push(`${label} (erro: ${err.message})`);
    console.log(`  ERRO ${label}: ${err.message}`);
  }
}

function functionSourceContains(rows, needle) {
  return rows.length > 0 && rows.some((r) => (r.def || r.source || '').includes(needle));
}

async function main() {
  console.log('=== Verificação de migrations de segurança (Tauze Class) ===\n');

  console.log('-- E-mail confirmado obrigatório --');
  await check('is_email_confirmed() existe', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'is_email_confirmed'`);
    return rows.length > 0;
  });
  await check('policy de INSERT em ads exige e-mail confirmado (ou admin)', async () => {
    const rows = await sql(`
      select pg_get_expr(polwithcheck, polrelid) as with_check
      from pg_policy
      where polrelid = 'public.ads'::regclass and polcmd = 'a'
    `);
    return rows.some((r) => r.with_check?.includes('is_email_confirmed') && r.with_check?.includes('is_admin'));
  });
  await check('place_bid_atomic exige e-mail confirmado', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'place_bid_atomic'`);
    return functionSourceContains(rows, 'email_confirmed_at');
  });
  await check('place_lot_bid_atomic exige e-mail confirmado', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'place_lot_bid_atomic'`);
    return functionSourceContains(rows, 'email_confirmed_at');
  });

  console.log('\n-- Guards de lances/moderação --');
  await check('is_valid_bid_amount() rejeita Infinity/-Infinity', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'is_valid_bid_amount'`);
    return functionSourceContains(rows, 'Infinity');
  });
  await check('guard_ad_moderation() bloqueia qualquer saída de status=deleted', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'guard_ad_moderation'`);
    return functionSourceContains(rows, 'deleted');
  });

  console.log('\n-- Rate limiting --');
  await check('check_message_rate_limit() existe (cap por par sender/receiver)', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'check_message_rate_limit'`);
    return rows.length > 0;
  });
  await check('rpc_check_video_upload_rate_limit() existe', async () => {
    const rows = await sql(`select pg_get_functiondef(oid) as def from pg_proc where proname = 'rpc_check_video_upload_rate_limit'`);
    return rows.length > 0;
  });

  console.log('\n-- Audit log de admin --');
  await check('tabela admin_audit_log existe', async () => {
    const rows = await sql(`select 1 from information_schema.tables where table_schema='public' and table_name='admin_audit_log'`);
    return rows.length > 0;
  });
  await check('admin_audit_log só é legível por admin (RLS)', async () => {
    const rows = await sql(`
      select pg_get_expr(polqual, polrelid) as using_expr
      from pg_policy
      where polrelid = 'public.admin_audit_log'::regclass and polcmd = 'r'
    `);
    return rows.some((r) => r.using_expr?.includes('is_admin'));
  });
  await check('log_admin_action() existe e é SECURITY DEFINER', async () => {
    const rows = await sql(`
      select p.prosecdef, pg_get_functiondef(p.oid) as def
      from pg_proc p where p.proname = 'log_admin_action'
    `);
    return rows.length > 0 && rows[0].prosecdef === true;
  });

  console.log('\n-- Migração de slug (UUID→slug) --');
  for (const [table, hasStatus] of [['ads', false], ['profiles', false], ['auction_events', false], ['eventos', false]]) {
    await check(`${table}.slug existe, NOT NULL, com índice único`, async () => {
      const cols = await sql(`
        select is_nullable from information_schema.columns
        where table_schema='public' and table_name='${table}' and column_name='slug'
      `);
      if (cols.length === 0 || cols[0].is_nullable !== 'NO') return false;
      const idx = await sql(`
        select indexdef from pg_indexes
        where schemaname='public' and tablename='${table}' and indexdef ilike '%slug%' and indexdef ilike '%unique%'
      `);
      return idx.length > 0;
    });
  }
  await check('eventos: anon/authenticated têm GRANT explícito na coluna slug', async () => {
    const rows = await sql(`
      select grantee, privilege_type from information_schema.column_privileges
      where table_schema='public' and table_name='eventos' and column_name='slug'
        and grantee in ('anon','authenticated')
    `);
    const grantees = new Set(rows.map((r) => r.grantee));
    return grantees.has('anon') && grantees.has('authenticated');
  });

  console.log(`\n=== ${passed} passou, ${failed} falhou ===`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exitCode = 1;
});
