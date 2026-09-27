'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { showToast } from '@/lib/toast'

interface HealthSample {
  created_at: string
  rss_bytes: number
  heap_used_bytes: number
  uptime_seconds: number
  db_size_bytes: number | null
  pg_connections_active: number | null
  pg_connections_max: number | null
  upstash_configured: boolean | null
  webhook_failures_24h: number | null
}

interface RenderEvent {
  render_event_id: string
  event_type: string
  occurred_at: string
  details: { reason?: { oomKilled?: { memoryLimit: string }; evicted?: boolean }; deployStatus?: string }
}

interface WebhookFailure {
  id: string
  created_at: string
  gateway: string
  event_type: string | null
  reason: string
  details: Record<string, unknown>
}

// Cada card de KPI que representa uma série numérica vira uma opção de
// métrica pro gráfico principal (clique no card -- ver handleSelectMetric).
// Uptime/Banco/Conexões/Heap todos fazem sentido como linha do tempo; Upstash
// (booleano quase-constante) e Webhook (evento discreto, não série contínua)
// ficam de fora e têm sua própria ação de clique abaixo.
type MetricKey = 'memory' | 'uptime' | 'db' | 'pg_connections' | 'heap'

function metricConfig(
  key: MetricKey,
  latest: HealthSample | undefined
): { label: string; color: string; limit?: number; formatValue: (v: number) => string; getValue: (s: HealthSample) => number | null } {
  switch (key) {
    case 'memory':
      return { label: 'Memória (RSS)', color: '#2563eb', limit: RENDER_MEMORY_LIMIT_BYTES / 1024 / 1024, formatValue: (v) => `${v.toFixed(0)} MB`, getValue: (s) => s.rss_bytes / 1024 / 1024 }
    case 'uptime':
      return { label: 'Uptime (quedas = reinícios do serviço)', color: '#ea580c', formatValue: (v) => `${v.toFixed(1)}h`, getValue: (s) => s.uptime_seconds / 3600 }
    case 'db':
      return { label: 'Tamanho do Banco de Dados', color: '#7c3aed', limit: SUPABASE_DB_LIMIT_BYTES / 1024 / 1024, formatValue: (v) => `${v.toFixed(0)} MB`, getValue: (s) => (s.db_size_bytes != null ? s.db_size_bytes / 1024 / 1024 : null) }
    case 'pg_connections':
      return { label: 'Conexões Ativas do Postgres', color: '#0891b2', limit: latest?.pg_connections_max ?? undefined, formatValue: (v) => `${v.toFixed(0)}`, getValue: (s) => s.pg_connections_active }
    case 'heap':
      return { label: 'Heap V8 (memória JS)', color: '#16a34a', formatValue: (v) => `${v.toFixed(0)} MB`, getValue: (s) => s.heap_used_bytes / 1024 / 1024 }
  }
}

// Rótulo + cor legíveis pra cada tipo de evento do Render -- antes disso a
// coluna "Tipo" só mostrava o enum cru (deploy_ended, server_available),
// inconsistente com o badge "OOM" já traduzido (achado ao vivo pelo
// usuário, screenshot anotado). deploy_ended também passa a distinguir
// sucesso de falha via details.deployStatus, em vez de assumir sucesso
// sempre.
function eventLabel(e: RenderEvent): { text: string; color: string; bg: string } {
  const isOom = e.event_type === 'server_failed' && !!e.details?.reason?.oomKilled
  const isEvicted = e.event_type === 'server_failed' && !!e.details?.reason?.evicted
  if (isOom) return { text: 'OOM', color: 'var(--adm-red)', bg: 'rgba(220,38,38,0.1)' }
  if (isEvicted) return { text: 'Instância Removida', color: 'var(--adm-red)', bg: 'rgba(220,38,38,0.1)' }
  if (e.event_type === 'server_failed') return { text: 'Falha no Serviço', color: 'var(--adm-red)', bg: 'rgba(220,38,38,0.1)' }
  if (e.event_type === 'server_available') return { text: 'Serviço Disponível', color: 'var(--adm-green)', bg: 'rgba(22,163,74,0.1)' }
  if (e.event_type === 'deploy_started') return { text: 'Deploy Iniciado', color: 'var(--adm-accent)', bg: 'rgba(37,99,235,0.1)' }
  if (e.event_type === 'deploy_ended') {
    const failed = e.details?.deployStatus && e.details.deployStatus !== 'succeeded'
    return failed
      ? { text: 'Deploy Falhou', color: 'var(--adm-red)', bg: 'rgba(220,38,38,0.1)' }
      : { text: 'Deploy Concluído', color: 'var(--adm-green)', bg: 'rgba(22,163,74,0.1)' }
  }
  return { text: e.event_type, color: 'var(--adm-text-muted)', bg: 'rgba(107,114,128,0.1)' }
}

// Limites documentados (não vêm de nenhuma API -- ver comentário em
// scripts/monitor-render-supabase.mjs sobre por quê): plano Free do Render
// (512MB RAM) e do Supabase (500MB de banco). Conferir de novo se algum dia
// os planos mudarem.
const RENDER_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024
const SUPABASE_DB_LIMIT_BYTES = 500 * 1024 * 1024

function formatMB(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function ratioColor(ratio: number): string {
  if (ratio >= 0.9) return 'var(--adm-red)'
  if (ratio >= 0.7) return 'var(--adm-amber)'
  return 'var(--adm-green)'
}

// Cards de KPI clicáveis (drill-down) ganham cursor de ponteiro e um anel
// interno quando são a fonte ativa do gráfico/filtro abaixo -- boxShadow em
// vez de border pra não alterar o tamanho do card (adm-stat-card já tem
// border própria definida em admin-v2.css).
function clickableCardStyle(active: boolean): React.CSSProperties {
  return {
    cursor: 'pointer',
    boxShadow: active ? 'inset 0 0 0 2px var(--adm-accent)' : undefined,
  }
}

// ── Gráfico de linha (pure SVG — zero deps, mesmo espírito do BarChart de
// admin/api-keys/usage/page.tsx) ──────────────────────────────────────────
function LineChart({
  data,
  limit,
  color = '#2563eb',
  formatValue = formatMB,
}: {
  data: { t: number; v: number }[]
  limit?: number
  color?: string
  formatValue?: (v: number) => string
}) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', padding: '32px', color: 'var(--adm-text-muted)' }}>Sem amostras ainda</div>
  }
  const W = 700, H = 200, PAD = 30
  const maxV = Math.max(...data.map(d => d.v), limit || 0) * 1.1
  const minT = Math.min(...data.map(d => d.t))
  const maxT = Math.max(...data.map(d => d.t))
  const spanT = Math.max(1, maxT - minT)

  const x = (t: number) => PAD + ((t - minT) / spanT) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2)

  const points = data.map(d => `${x(d.t)},${y(d.v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {limit && (
        <>
          <line x1={PAD} y1={y(limit)} x2={W - PAD} y2={y(limit)} stroke="var(--adm-red)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
          <text x={W - PAD} y={y(limit) - 4} textAnchor="end" fontSize={10} fill="var(--adm-red)">limite ({formatValue(limit)})</text>
        </>
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      {data.map((d, i) => (
        <circle key={i} cx={x(d.t)} cy={y(d.v)} r={2.5} fill={color} />
      ))}
      <text x={PAD} y={H - 8} fontSize={10} fill="var(--adm-text-muted)">{new Date(minT).toLocaleString('pt-BR')}</text>
      <text x={W - PAD} y={H - 8} textAnchor="end" fontSize={10} fill="var(--adm-text-muted)">{new Date(maxT).toLocaleString('pt-BR')}</text>
    </svg>
  )
}

export default function AdminMonitoramento() {
  const [samples, setSamples] = useState<HealthSample[]>([])
  const [events, setEvents] = useState<RenderEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [restarting, setRestarting] = useState(false)
  const [checkingNow, setCheckingNow] = useState(false)
  const [maintenance, setMaintenance] = useState<boolean | null>(null)
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const { confirm } = useConfirm()

  // Drill-down: clique num card de KPI troca a métrica do gráfico principal,
  // filtra a tabela de eventos, ou revela a tabela de falhas de webhook
  // (achado ao vivo pelo usuário -- "consigo ver as informações que
  // compoem?" -- os 8 cards eram só números estáticos até aqui).
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('memory')
  const [eventFilter, setEventFilter] = useState<'all' | 'oom'>('all')
  const [webhookFailures, setWebhookFailures] = useState<WebhookFailure[]>([])
  const [showWebhookTable, setShowWebhookTable] = useState(false)
  const [loadingWebhookFailures, setLoadingWebhookFailures] = useState(false)
  const chartSectionRef = React.useRef<HTMLDivElement>(null)
  const eventsSectionRef = React.useRef<HTMLDivElement>(null)
  const webhookSectionRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [days])
  useEffect(() => { loadMaintenanceStatus() }, [])

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleSelectMetric(metric: MetricKey) {
    setSelectedMetric(metric)
    scrollTo(chartSectionRef)
  }

  function handleFilterEvents(filter: 'all' | 'oom') {
    setEventFilter(filter)
    scrollTo(eventsSectionRef)
  }

  // Falhas de webhook não vêm em loadData() (tabela separada, só relevante
  // sob demanda) -- busca uma vez ao abrir a tabela, não a cada re-render.
  async function handleShowWebhookFailures() {
    setShowWebhookTable(true)
    if (webhookFailures.length > 0) {
      scrollTo(webhookSectionRef)
      return
    }
    setLoadingWebhookFailures(true)
    try {
      const supabase = getSupabase()
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error: fetchErr } = await supabase
        .from('webhook_failures')
        .select('id, created_at, gateway, event_type, reason, details')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30)
      if (fetchErr && !['42P01', '42703'].includes(fetchErr.code)) throw fetchErr
      setWebhookFailures((data || []) as WebhookFailure[])
    } catch (err: any) {
      showToast(`Falha ao carregar falhas de webhook: ${err.message}`, 'error')
    } finally {
      setLoadingWebhookFailures(false)
      scrollTo(webhookSectionRef)
    }
  }

  async function loadMaintenanceStatus() {
    try {
      const res = await fetch('/api/admin/system/maintenance')
      const body = await res.json()
      if (res.ok) setMaintenance(body.enabled)
    } catch {
      // Silencioso -- ausência de RENDER_API_KEY/RENDER_SERVICE_ID no
      // ambiente é um estado válido até o usuário configurar (ver botão de
      // restart, mesma dependência); o toggle só some do jeito certo.
    }
  }

  // Verifica a saúde agora mesmo, sem esperar a próxima rodada horária do
  // monitor externo -- útil enquanto se investiga um problema ao vivo.
  async function handleCheckNow() {
    setCheckingNow(true)
    try {
      const res = await fetch('/api/admin/system/check-now', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      showToast('Verificação concluída.', 'success')
      await loadData()
    } catch (err: any) {
      showToast(`Falha ao verificar agora: ${err.message}`, 'error')
    } finally {
      setCheckingNow(false)
    }
  }

  // Modo de manutenção do Render -- tira o site do ar de PROPÓSITO pra
  // usuários reais (ver comentário na rota de API), por isso a confirmação
  // é mais enfática que a do restart.
  async function handleToggleMaintenance() {
    const next = !maintenance
    const msg = next
      ? 'Ativar o MODO DE MANUTENÇÃO agora? O site vai parar de responder pra todos os visitantes até você desativar de novo aqui.'
      : 'Desativar o modo de manutenção e voltar o site ao ar pra todos os visitantes?'
    if (!(await confirm(msg))) return

    setMaintenanceLoading(true)
    try {
      const res = await fetch('/api/admin/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setMaintenance(next)
      showToast(next ? 'Modo de manutenção ativado.' : 'Site de volta ao ar.', 'success')
    } catch (err: any) {
      showToast(`Falha ao mudar modo de manutenção: ${err.message}`, 'error')
    } finally {
      setMaintenanceLoading(false)
    }
  }

  // Reinicia o Web Service no Render (ver app/api/admin/system/restart-render/
  // route.ts sobre por que isto é sempre um clique humano, nunca automático).
  async function handleRestart() {
    if (!(await confirm(
      'Reiniciar o serviço no Render agora? O site fica temporariamente indisponível durante o restart (mesma janela que já acontece hoje quando o Render reinicia sozinho após um OOM).'
    ))) return

    setRestarting(true)
    try {
      const res = await fetch('/api/admin/system/restart-render', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      showToast('Restart solicitado com sucesso. O serviço volta em instantes.', 'success')
    } catch (err: any) {
      showToast(`Falha ao reiniciar: ${err.message}`, 'error')
    } finally {
      setRestarting(false)
    }
  }

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabase()
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const [{ data: sampleData, error: sampleErr }, { data: eventData, error: eventErr }] = await Promise.all([
        supabase
          .from('system_health_samples')
          .select('created_at, rss_bytes, heap_used_bytes, uptime_seconds, db_size_bytes, pg_connections_active, pg_connections_max, upstash_configured, webhook_failures_24h')
          .gte('created_at', since)
          .order('created_at', { ascending: true }),
        supabase
          .from('render_events_log')
          .select('render_event_id, event_type, occurred_at, details')
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(30),
      ])

      // BUG EVITADO: as tabelas/colunas novas só existem depois das
      // migrations serem aplicadas manualmente (classificador bloqueia
      // mutação de banco pra este ambiente) -- 42P01 (relation does not
      // exist) / 42703 (column does not exist) são estados esperados
      // enquanto isso não acontece, não um erro real do usuário final;
      // distingue pra dar um aviso útil em vez do erro cru do Postgres.
      if (['42P01', '42703'].includes(sampleErr?.code) || ['42P01', '42703'].includes(eventErr?.code)) {
        setError('Tabelas/colunas de monitoramento ainda não existem -- aplique as migrations 20260927120000 e 20260927130000 no Supabase.')
        setSamples([])
        setEvents([])
        return
      }
      if (sampleErr) throw sampleErr
      if (eventErr) throw eventErr

      setSamples(sampleData || [])
      setEvents((eventData || []) as RenderEvent[])
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido carregando dados de monitoramento.')
    } finally {
      setLoading(false)
    }
  }

  const latest = samples[samples.length - 1]
  const memRatio = latest ? latest.rss_bytes / RENDER_MEMORY_LIMIT_BYTES : 0
  const dbRatio = latest?.db_size_bytes ? latest.db_size_bytes / SUPABASE_DB_LIMIT_BYTES : 0

  const oomCount = events.filter(e => e.event_type === 'server_failed' && (e.details?.reason?.oomKilled || e.details?.reason?.evicted)).length

  const activeMetric = metricConfig(selectedMetric, latest)
  const metricChartData = samples
    .map(s => {
      const v = activeMetric.getValue(s)
      return v == null ? null : { t: new Date(s.created_at).getTime(), v }
    })
    .filter((d): d is { t: number; v: number } => d !== null)
  const filteredEvents = eventFilter === 'oom'
    ? events.filter(e => e.event_type === 'server_failed' && (e.details?.reason?.oomKilled || e.details?.reason?.evicted))
    : events
  const sampleAgeMinutes = latest ? Math.round((Date.now() - new Date(latest.created_at).getTime()) / 60000) : 0

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Monitoramento do Sistema</h1>
          <p className="adm-page-sub">
            Memória e uptime do servidor (Render), tamanho do banco e conexões ativas do Postgres, se o Redis
            (Upstash) está configurado, e falhas de webhook de pagamento não processadas. Uma amostra nova é salva a
            cada hora (ou na hora, clicando em &quot;Verificar Agora&quot;).
          </p>
          {latest && (
            <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
              Última amostra: {new Date(latest.created_at).toLocaleString('pt-BR')}
              {' '}
              ({sampleAgeMinutes < 60 ? `há ${sampleAgeMinutes}min` : `há ${(sampleAgeMinutes / 60).toFixed(1)}h`})
              {sampleAgeMinutes > 90 && (
                <span style={{ color: 'var(--adm-amber)', fontWeight: 600 }}>
                  {' '}— desatualizada, clique em &quot;Verificar Agora&quot; pra atualizar
                </span>
              )}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>Período:</span>
            {[1, 7, 30].map(d => (
              <button key={d} className={`adm-btn adm-btn--sm ${days === d ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
          {/* Roda a checagem agora, sem esperar a próxima hora cheia. */}
          <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={handleCheckNow} disabled={checkingNow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {checkingNow ? 'Verificando...' : 'Verificar Agora'}
          </button>
          {/* Reinicia o Web Service no Render -- sempre atrás de confirmação,
              nunca disparado automaticamente (ver comentário na rota de API). */}
          <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={handleRestart} disabled={restarting} style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            {restarting ? 'Reiniciando...' : 'Reiniciar Serviço'}
          </button>
          {/* Modo de manutenção -- só aparece quando conseguimos ler o
              status atual (RENDER_API_KEY/RENDER_SERVICE_ID configuradas). */}
          {maintenance !== null && (
            <button
              className="adm-btn adm-btn--sm adm-btn--outline"
              onClick={handleToggleMaintenance}
              disabled={maintenanceLoading}
              style={maintenance ? { color: 'var(--adm-red)', borderColor: 'var(--adm-red)', background: 'rgba(220,38,38,0.08)' } : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              {maintenanceLoading ? 'Aplicando...' : maintenance ? 'Desativar Manutenção' : 'Modo de Manutenção'}
            </button>
          )}
        </div>
      </div>

      {maintenance && (
        <div className="adm-card" style={{ padding: '12px 24px', marginBottom: '20px', borderLeft: '3px solid var(--adm-red)', color: 'var(--adm-red)', fontWeight: 600 }}>
          🚧 O site está em MODO DE MANUTENÇÃO agora -- visitantes reais não conseguem acessar.
        </div>
      )}

      {error && (
        <div className="adm-card" style={{ padding: '16px 24px', marginBottom: '20px', borderLeft: '3px solid var(--adm-amber)', color: 'var(--adm-text)' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="adm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--adm-text-muted)' }}>Carregando...</div>
      ) : (
        <>
          {/* KPI cards -- adm-stats-grid--fixed4 força 4 por linha em telas
              largas (7 cards com auto-fit puro quebrava 5+2, ver
              app/(admin)/admin/admin-v2.css). */}
          <div className="adm-stats-grid adm-stats-grid--fixed4" style={{ marginBottom: '24px' }}>
            <div className="adm-stat-card" onClick={() => handleSelectMetric('memory')} style={clickableCardStyle(selectedMetric === 'memory')} title="Ver gráfico de memória (RSS)">
              <div>
                <div className="adm-stat-val" style={{ color: latest ? ratioColor(memRatio) : undefined }}>
                  {latest ? formatMB(latest.rss_bytes) : '—'}
                </div>
                <div className="adm-stat-lbl">Memória Atual (limite 512MB)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg></div>
            </div>
            <div className="adm-stat-card" onClick={() => handleSelectMetric('uptime')} style={clickableCardStyle(selectedMetric === 'uptime')} title="Ver gráfico de uptime (quedas indicam reinícios)">
              <div>
                <div className="adm-stat-val">{latest ? formatUptime(latest.uptime_seconds) : '—'}</div>
                <div className="adm-stat-lbl">Uptime desde o último restart</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            </div>
            <div className="adm-stat-card" onClick={() => handleSelectMetric('db')} style={clickableCardStyle(selectedMetric === 'db')} title="Ver gráfico de tamanho do banco de dados">
              <div>
                <div className="adm-stat-val" style={{ color: latest?.db_size_bytes ? ratioColor(dbRatio) : undefined }}>
                  {latest?.db_size_bytes ? formatMB(latest.db_size_bytes) : '—'}
                </div>
                <div className="adm-stat-lbl">Banco de Dados (limite 500MB)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div>
            </div>
            <div className="adm-stat-card" onClick={() => handleFilterEvents('oom')} style={clickableCardStyle(eventFilter === 'oom')} title="Ver só os eventos de OOM na tabela abaixo">
              <div>
                <div className="adm-stat-val" style={{ color: oomCount > 0 ? 'var(--adm-red)' : undefined }}>{oomCount}</div>
                <div className="adm-stat-lbl">Crashes de OOM ({days}d)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            </div>
            <div className="adm-stat-card" onClick={() => handleSelectMetric('pg_connections')} style={clickableCardStyle(selectedMetric === 'pg_connections')} title="Ver gráfico de conexões ativas do Postgres">
              <div>
                <div className="adm-stat-val" style={{ color: latest?.pg_connections_max ? ratioColor((latest.pg_connections_active || 0) / latest.pg_connections_max) : undefined }}>
                  {latest?.pg_connections_max ? `${latest.pg_connections_active}/${latest.pg_connections_max}` : '—'}
                </div>
                <div className="adm-stat-lbl">Conexões do Postgres</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg></div>
            </div>
            {/* Sem onClick de propósito: booleano quase-constante, não há
                série temporal nem detalhe adicional que valha a pena revelar. */}
            <div className="adm-stat-card">
              <div>
                <div className="adm-stat-val" style={{ color: latest?.upstash_configured === false ? 'var(--adm-amber)' : latest?.upstash_configured ? 'var(--adm-green)' : undefined }}>
                  {latest?.upstash_configured == null ? '—' : latest.upstash_configured ? 'Sim' : 'Não'}
                </div>
                <div className="adm-stat-lbl">Upstash (Redis) Configurado</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
            </div>
            <div className="adm-stat-card" onClick={handleShowWebhookFailures} style={clickableCardStyle(showWebhookTable)} title="Ver a lista de falhas de webhook">
              <div>
                <div className="adm-stat-val" style={{ color: (latest?.webhook_failures_24h || 0) > 0 ? 'var(--adm-red)' : undefined }}>
                  {latest?.webhook_failures_24h ?? '—'}
                </div>
                <div className="adm-stat-lbl">Falhas de Webhook (24h)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            </div>
            {/* 8o card (fecha 4+4 -- achado ao vivo pelo usuário, grid ficava
                4+3). Heap V8 != RSS: RSS é toda a memória do processo,
                heap é só o lado JS. Um heap baixo com RSS alto aponta pra
                memória NATIVA (sharp/Image Optimization, a hipótese
                investigada pro OOM original) -- não um vazamento no
                código JS em si. */}
            <div className="adm-stat-card" onClick={() => handleSelectMetric('heap')} style={clickableCardStyle(selectedMetric === 'heap')} title="Ver gráfico de heap V8 (memória JS)">
              <div>
                <div className="adm-stat-val">{latest ? formatMB(latest.heap_used_bytes) : '—'}</div>
                <div className="adm-stat-lbl">Heap V8 (memória JS)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
            </div>
          </div>

          {/* Gráfico principal -- métrica trocada pelo clique nos cards de
              KPI acima (ver handleSelectMetric/metricConfig). */}
          <div ref={chartSectionRef} className="adm-card" style={{ marginBottom: '20px', padding: '20px 24px', scrollMarginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--adm-text)', marginBottom: '16px' }}>📈 {activeMetric.label} ao Longo do Tempo</div>
            <LineChart data={metricChartData} limit={activeMetric.limit} color={activeMetric.color} formatValue={activeMetric.formatValue} />
          </div>

          {/* Falhas de webhook -- carregadas sob demanda (ver
              handleShowWebhookFailures), não fazem parte de loadData(). */}
          {showWebhookTable && (
            <div ref={webhookSectionRef} className="adm-card" style={{ marginBottom: '20px', scrollMarginTop: '16px' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--adm-border)', fontWeight: 600, fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔌 Falhas de Webhook ({days}d)</span>
                <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setShowWebhookTable(false)}>Fechar</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Gateway</th>
                      <th>Evento</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingWebhookFailures ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Carregando...</td></tr>
                    ) : webhookFailures.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Nenhuma falha de webhook no período</td></tr>
                    ) : webhookFailures.map(w => (
                      <tr key={w.id}>
                        <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{new Date(w.created_at).toLocaleString('pt-BR')}</td>
                        <td style={{ fontSize: '0.85rem' }}>{w.gateway}</td>
                        <td style={{ fontSize: '0.85rem' }}>{w.event_type || '—'}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>{w.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Render events timeline */}
          <div ref={eventsSectionRef} className="adm-card" style={{ scrollMarginTop: '16px' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--adm-border)', fontWeight: 600, fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span>🕐 Eventos Recentes do Render</span>
              {eventFilter === 'oom' && (
                <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setEventFilter('all')}>
                  Filtrando: só OOM/Instância Removida — limpar filtro
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Tipo</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Nenhum evento {eventFilter === 'oom' ? 'de OOM' : ''} no período</td></tr>
                  ) : filteredEvents.map(e => {
                    const isOom = e.event_type === 'server_failed' && !!e.details?.reason?.oomKilled
                    const isEvicted = e.event_type === 'server_failed' && !!e.details?.reason?.evicted
                    const label = eventLabel(e)
                    return (
                      <tr key={e.render_event_id}>
                        <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {new Date(e.occurred_at).toLocaleString('pt-BR')}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                            background: label.bg, color: label.color,
                          }}>
                            {label.text}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>
                          {isOom ? `Falta de memória (limite ${e.details.reason?.oomKilled?.memoryLimit})` : isEvicted ? 'Instância removida' : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
