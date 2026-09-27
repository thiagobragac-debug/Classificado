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
}

interface RenderEvent {
  render_event_id: string
  event_type: string
  occurred_at: string
  details: { reason?: { oomKilled?: { memoryLimit: string }; evicted?: boolean } }
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

// ── Gráfico de linha (pure SVG — zero deps, mesmo espírito do BarChart de
// admin/api-keys/usage/page.tsx) ──────────────────────────────────────────
function LineChart({
  data,
  limit,
  color = '#2563eb',
}: {
  data: { t: number; v: number }[]
  limit?: number
  color?: string
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
          <text x={W - PAD} y={y(limit) - 4} textAnchor="end" fontSize={10} fill="var(--adm-red)">limite ({formatMB(limit)})</text>
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
  const { confirm } = useConfirm()

  useEffect(() => { loadData() }, [days])

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
          .select('created_at, rss_bytes, heap_used_bytes, uptime_seconds, db_size_bytes')
          .gte('created_at', since)
          .order('created_at', { ascending: true }),
        supabase
          .from('render_events_log')
          .select('render_event_id, event_type, occurred_at, details')
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(30),
      ])

      // BUG EVITADO: as duas tabelas só existem depois da migration
      // 20260927120000 ser aplicada manualmente (classificador bloqueia
      // mutação de banco pra este ambiente) -- 42P01 (relation does not
      // exist) é um estado esperado no primeiro carregamento desta página,
      // não um erro real do usuário final; distingue pra dar um aviso útil
      // em vez do erro cru do Postgres.
      if (sampleErr?.code === '42P01' || eventErr?.code === '42P01') {
        setError('Tabelas de monitoramento ainda não existem -- aplique a migration 20260927120000_cria_tabelas_monitoramento_sistema.sql no Supabase.')
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

  const memChartData = samples.map(s => ({ t: new Date(s.created_at).getTime(), v: s.rss_bytes / 1024 / 1024 }))

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Monitoramento do Sistema</h1>
          <p className="adm-page-sub">Memória do Render, saúde e tamanho do banco no Supabase. Amostrado a cada hora.</p>
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
          {/* Reinicia o Web Service no Render -- sempre atrás de confirmação,
              nunca disparado automaticamente (ver comentário na rota de API). */}
          <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={handleRestart} disabled={restarting} style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            {restarting ? 'Reiniciando...' : 'Reiniciar Serviço'}
          </button>
        </div>
      </div>

      {error && (
        <div className="adm-card" style={{ padding: '16px 24px', marginBottom: '20px', borderLeft: '3px solid var(--adm-amber)', color: 'var(--adm-text)' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="adm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--adm-text-muted)' }}>Carregando...</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="adm-stats-grid" style={{ marginBottom: '24px' }}>
            <div className="adm-stat-card">
              <div>
                <div className="adm-stat-val" style={{ color: latest ? ratioColor(memRatio) : undefined }}>
                  {latest ? formatMB(latest.rss_bytes) : '—'}
                </div>
                <div className="adm-stat-lbl">Memória Atual (limite 512MB)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg></div>
            </div>
            <div className="adm-stat-card">
              <div>
                <div className="adm-stat-val">{latest ? formatUptime(latest.uptime_seconds) : '—'}</div>
                <div className="adm-stat-lbl">Uptime desde o último restart</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            </div>
            <div className="adm-stat-card">
              <div>
                <div className="adm-stat-val" style={{ color: latest?.db_size_bytes ? ratioColor(dbRatio) : undefined }}>
                  {latest?.db_size_bytes ? formatMB(latest.db_size_bytes) : '—'}
                </div>
                <div className="adm-stat-lbl">Banco de Dados (limite 500MB)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div>
            </div>
            <div className="adm-stat-card">
              <div>
                <div className="adm-stat-val" style={{ color: oomCount > 0 ? 'var(--adm-red)' : undefined }}>{oomCount}</div>
                <div className="adm-stat-lbl">Crashes de OOM ({days}d)</div>
              </div>
              <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            </div>
          </div>

          {/* Memory chart */}
          <div className="adm-card" style={{ marginBottom: '20px', padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--adm-text)', marginBottom: '16px' }}>📈 Memória (RSS) ao Longo do Tempo</div>
            <LineChart data={memChartData} limit={512} color="#2563eb" />
          </div>

          {/* Render events timeline */}
          <div className="adm-card">
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--adm-border)', fontWeight: 600, fontSize: '1rem' }}>
              🕐 Eventos Recentes do Render
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
                  {events.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Nenhum evento no período</td></tr>
                  ) : events.map(e => {
                    const isOom = e.event_type === 'server_failed' && !!e.details?.reason?.oomKilled
                    const isEvicted = e.event_type === 'server_failed' && !!e.details?.reason?.evicted
                    return (
                      <tr key={e.render_event_id}>
                        <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {new Date(e.occurred_at).toLocaleString('pt-BR')}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                            background: isOom ? 'rgba(220,38,38,0.1)' : e.event_type.startsWith('deploy') ? 'rgba(37,99,235,0.1)' : 'rgba(107,114,128,0.1)',
                            color: isOom ? 'var(--adm-red)' : e.event_type.startsWith('deploy') ? 'var(--adm-accent)' : 'var(--adm-text-muted)',
                          }}>
                            {isOom ? 'OOM' : e.event_type}
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
