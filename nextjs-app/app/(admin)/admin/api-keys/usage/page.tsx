'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

interface DayStats {
  day: string
  total: number
  success: number
  errors: number
  avg_ms: number
}

interface KeyStats {
  partner_name: string
  total_calls: number
  last_used: string | null
}

interface HourStats {
  hour: number
  total: number
}

export default function AdminApiUsage() {
  const [dailyStats, setDailyStats]   = useState<DayStats[]>([])
  const [keyStats, setKeyStats]       = useState<KeyStats[]>([])
  const [hourStats, setHourStats]     = useState<HourStats[]>([])
  const [totals, setTotals]           = useState({ total: 0, success: 0, errors: 0, avg_ms: 0 })
  const [loading, setLoading]         = useState(true)
  const [period, setPeriod]           = useState(14)

  useEffect(() => { loadStats() }, [period])

  async function loadStats() {
    setLoading(true)
    const supabase = getSupabase()
    try {

    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()

    // BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): o builder
    // devolvido por supabase.rpc(...).throwOnError() é "thenable" mas não é
    // uma Promise nativa — não tem .catch() (mesma classe de bug já corrigida
    // em admin/page.tsx nesta sessão). Chamar .catch() aqui lançava um
    // TypeError SÍNCRONO antes mesmo de awaitar a chamada, o que nunca
    // chegava no fallback manual abaixo (que já existia, mas nunca era
    // alcançado) nem no setLoading(false) do fim da função — a tela ficava
    // travada em "Carregando dados..." para sempre. A função get_api_daily_stats
    // também não existe no banco (PGRST202); desestruturar error normalmente
    // (sem throwOnError) deixa `daily` null nesse caso, que já é exatamente a
    // condição que o fallback manual abaixo espera.
    const { data: daily } = await supabase.rpc('get_api_daily_stats', { since_date: since })

    // Fallback: manual query if RPC doesn't exist yet
    let dailyData: DayStats[] = []
    if (!daily) {
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('created_at, status_code, duration_ms')
        .gte('created_at', since)
        .order('created_at', { ascending: true })

      if (logs) {
        const grouped: Record<string, { total: number; success: number; errors: number; ms: number[] }> = {}
        for (const log of logs) {
          const day = log.created_at.slice(0, 10)
          if (!grouped[day]) grouped[day] = { total: 0, success: 0, errors: 0, ms: [] }
          grouped[day].total++
          if (log.status_code < 400) grouped[day].success++
          else grouped[day].errors++
          if (log.duration_ms) grouped[day].ms.push(log.duration_ms)
        }
        dailyData = Object.entries(grouped).map(([day, v]) => ({
          day,
          total: v.total,
          success: v.success,
          errors: v.errors,
          avg_ms: v.ms.length ? Math.round(v.ms.reduce((a, b) => a + b, 0) / v.ms.length) : 0,
        }))
      }
    } else {
      dailyData = daily as DayStats[]
    }
    setDailyStats(dailyData)

    // ── Totals ───────────────────────────────────────────────────────────────
    const allTotal   = dailyData.reduce((a, d) => a + d.total, 0)
    const allSuccess = dailyData.reduce((a, d) => a + d.success, 0)
    const allErrors  = dailyData.reduce((a, d) => a + d.errors, 0)
    const allMs      = dailyData.filter(d => d.avg_ms > 0)
    const avgMs      = allMs.length ? Math.round(allMs.reduce((a, d) => a + d.avg_ms, 0) / allMs.length) : 0
    setTotals({ total: allTotal, success: allSuccess, errors: allErrors, avg_ms: avgMs })

    // ── Per-key stats ────────────────────────────────────────────────────────
    const { data: keyLogs } = await supabase
      .from('api_request_logs')
      .select('api_key_id, created_at, api_keys!api_key_id(partner_name)')
      .gte('created_at', since)

    if (keyLogs) {
      const byKey: Record<string, { name: string; count: number; last: string }> = {}
      for (const log of keyLogs as any[]) {
        const id = log.api_key_id
        if (!id) continue
        if (!byKey[id]) byKey[id] = { name: log.api_keys?.partner_name || 'Desconhecido', count: 0, last: '' }
        byKey[id].count++
        if (!byKey[id].last || log.created_at > byKey[id].last) byKey[id].last = log.created_at
      }
      setKeyStats(
        Object.values(byKey)
          .map(k => ({ partner_name: k.name, total_calls: k.count, last_used: k.last }))
          .sort((a, b) => b.total_calls - a.total_calls)
          .slice(0, 10)
      )
    }

    // ── Hour-of-day distribution ─────────────────────────────────────────────
    const { data: hourLogs } = await supabase
      .from('api_request_logs')
      .select('created_at')
      .gte('created_at', since)

    if (hourLogs) {
      const byHour: Record<number, number> = {}
      for (let h = 0; h < 24; h++) byHour[h] = 0
      for (const log of hourLogs) {
        const h = new Date(log.created_at).getHours()
        byHour[h] = (byHour[h] || 0) + 1
      }
      setHourStats(Object.entries(byHour).map(([h, t]) => ({ hour: Number(h), total: t as number })))
    }

    } finally {
      setLoading(false)
    }
  }

  // ── Mini bar chart (pure SVG — zero deps) ────────────────────────────────────
  function BarChart({ data, color = '#16a34a', label = 'total' }: { data: { label: string; value: number }[]; color?: string; label?: string }) {
    const max = Math.max(...data.map(d => d.value), 1)
    const W = 700, H = 160, barW = Math.floor((W - 40) / (data.length || 1)) - 3
    // BUG CORRIGIDO (achado de usabilidade): rótulo do eixo X só aparecia
    // com <=14 barras — no período de 30 dias, TODOS os rótulos somiam,
    // deixando o gráfico ilegível (nenhuma referência de qual dia é qual
    // barra). Agora mostra 1 rótulo a cada N barras (N calculado pra caber
    // no máximo ~10 rótulos), em vez de esconder todos.
    const labelStep = Math.max(1, Math.ceil(data.length / 10))
    return (
      <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: '100%', display: 'block' }}>
        {data.map((d, i) => {
          const bh = Math.max(2, Math.round((d.value / max) * H))
          const x  = 20 + i * (barW + 3)
          const y  = H - bh
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={bh} rx={3} fill={color} opacity={0.85} />
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={H + 18} textAnchor="middle" fontSize={10} fill="var(--adm-text-muted)" style={{ fontFamily: 'Inter,sans-serif' }}>
                  {d.label.length >= 10 ? d.label.slice(5) : d.label}
                </text>
              )}
              {d.value > 0 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={9} fill={color} fontWeight="600">
                  {d.value}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Dashboard de Uso da API</h1>
          <p className="adm-page-sub">Monitoramento de chamadas, performance e uso por parceiro.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>Período:</span>
          {[7, 14, 30].map(d => (
            <button key={d} className={`adm-btn adm-btn--sm ${period === d ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setPeriod(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="adm-stats-grid" style={{ marginBottom: '24px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{totals.total.toLocaleString()}</div><div className="adm-stat-lbl">Total de Chamadas</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{totals.success.toLocaleString()}</div><div className="adm-stat-lbl">Respostas 2xx</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: totals.errors > 0 ? 'var(--adm-red)' : undefined }}>{totals.errors.toLocaleString()}</div><div className="adm-stat-lbl">Erros 4xx / 5xx</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{totals.avg_ms}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--adm-text-muted)', marginLeft: '4px' }}>ms</span></div><div className="adm-stat-lbl">Tempo Médio</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        </div>
      </div>

      {loading ? (
        <div className="adm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--adm-text-muted)' }}>Carregando dados...</div>
      ) : totals.total === 0 ? (
        <div className="adm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--adm-text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Nenhuma chamada registrada ainda</div>
          <div style={{ fontSize: '0.85rem' }}>Gere uma chave de API e faça sua primeira requisição para ver os dados aqui.</div>
        </div>
      ) : (
        <>
          {/* Daily calls chart */}
          <div className="adm-card" style={{ marginBottom: '20px', padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--adm-text)', marginBottom: '16px' }}>📈 Chamadas por Dia</div>
            <BarChart
              data={dailyStats.map(d => ({ label: d.day, value: d.total }))}
              color="#16a34a"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Error rate chart */}
            <div className="adm-card" style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--adm-text)', marginBottom: '16px' }}>🔴 Erros por Dia</div>
              <BarChart
                data={dailyStats.map(d => ({ label: d.day, value: d.errors }))}
                color="#dc2626"
              />
            </div>

            {/* Hour of day distribution */}
            <div className="adm-card" style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--adm-text)', marginBottom: '16px' }}>🕐 Distribuição por Hora</div>
              <BarChart
                data={hourStats.map(h => ({ label: `${String(h.hour).padStart(2, '0')}h`, value: h.total }))}
                color="#2563eb"
              />
            </div>
          </div>

          {/* Top partners table */}
          <div className="adm-card">
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--adm-border)', fontWeight: 600, fontSize: '1rem' }}>
              🏆 Top Parceiros por Uso
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Parceiro</th>
                    <th>Chamadas no Período</th>
                    <th>Último Uso</th>
                    <th>% do Total</th>
                  </tr>
                </thead>
                <tbody>
                  {keyStats.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Nenhum dado disponível</td></tr>
                  ) : keyStats.map((k, i) => {
                    const pct = totals.total > 0 ? ((k.total_calls / totals.total) * 100).toFixed(1) : '0'
                    return (
                      <tr key={i}>
                        <td style={{ color: 'var(--adm-text-muted)', width: '40px' }}>#{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{k.partner_name}</td>
                        <td>{k.total_calls.toLocaleString()}</td>
                        <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem' }}>
                          {k.last_used ? new Date(k.last_used).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--adm-border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: 'var(--adm-accent)', width: `${pct}%`, borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', minWidth: '36px' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Avg response time per day */}
            {dailyStats.some(d => d.avg_ms > 0) && (
              <div style={{ padding: '20px 24px', borderTop: '1px solid var(--adm-border)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--adm-text)', marginBottom: '12px' }}>⚡ Tempo Médio de Resposta (ms) por Dia</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {dailyStats.filter(d => d.avg_ms > 0).map(d => (
                    <div key={d.day} style={{
                      padding: '6px 12px', borderRadius: '8px', background: 'var(--adm-surface-2)',
                      border: '1px solid var(--adm-border)', fontSize: '0.8rem', textAlign: 'center'
                    }}>
                      <div style={{ color: 'var(--adm-text-muted)' }}>{d.day.slice(5)}</div>
                      <div style={{ fontWeight: 700, color: d.avg_ms > 1000 ? 'var(--adm-red)' : d.avg_ms > 500 ? 'var(--adm-amber)' : 'var(--adm-green)' }}>
                        {d.avg_ms}ms
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
