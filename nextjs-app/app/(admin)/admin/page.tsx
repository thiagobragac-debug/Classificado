'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

const BUCKET_LABELS: Record<string, string> = {
  'ad-images': 'Fotos de Anúncios',
  'ad-videos': 'Vídeos de Anúncios',
  'avatars': 'Avatares',
  'profile-banners': 'Banners de Perfil',
  'kyc-docs': 'Documentos KYC',
  'site-assets': 'Assets do Site',
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatRows(n: number): string {
  return n.toLocaleString('pt-BR')
}

interface ResourceUsage {
  dbTotalBytes: number
  dbTotalRows: number
  dbTables: { table_name: string; bytes: number }[]
  storageTotalBytes: number
  storageBuckets: { bucket_id: string; bytes: number; object_count: number }[]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    adsCount: 0,
    newToday: 0,
    activeUsers: 0,
    pendingAuth: 0,
    reports: 0,
    revenue: 0
  })
  // BUG CORRIGIDO (achado de usabilidade, 2026-08-29): os KPIs nasciam
  // zerados e só eram atualizados depois de loadRealStats() terminar, sem
  // nenhum estado de carregamento — um admin abrindo o dashboard via
  // conexão lenta via "0 Denúncias Abertas" / "0 Usuários" e não tinha como
  // distinguir isso de "carregando" vs. "de fato zero". Mesmo padrão de
  // `loading` (default true) já usado em anúncios/denúncias/mensagens.
  const [loading, setLoading] = useState(true)

  const [usage, setUsage] = useState<ResourceUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    loadRealStats()
    loadResourceUsage()
  }, [])

  async function loadResourceUsage() {
    setUsageLoading(true)
    setUsageError('')
    try {
      const res = await fetch('/api/admin/resource-usage')
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Falha ao carregar uso de recursos')
      setUsage(payload)
    } catch (err) {
      setUsageError((err as Error).message)
    }
    setUsageLoading(false)
  }

  async function loadRealStats() {
    const supabase = getSupabase()

    // BUG CORRIGIDO: supabase.from(...).select(...) não tem método .catch()
    // (não é uma Promise nativa, é um PostgrestBuilder — thenable, mas sem
    // catch/finally). A chamada `.catch(() => ({count: 0}))` lançava
    // TypeError síncrono ("...catch is not a function") ANTES mesmo de
    // awaitar a consulta de denúncias, o que abortava loadRealStats inteira
    // com uma promise rejeitada — como o setStats(...) só roda no final da
    // função, NENHUM dos 5 valores (mesmo os já buscados com sucesso antes
    // dessa linha) chegava a ser aplicado. Resultado real: o dashboard
    // ficava travado nos zeros iniciais para sempre, não importa quantos
    // usuários/anúncios existissem. Cada consulta agora trata seu próprio
    // erro (tabela 'reports' pode nem existir ainda) sem derrubar as demais.
    // select('id', ...) em vez de select('*', ...): profiles.is_admin/
    // is_blocked deixaram de ter grant público (achado de segurança
    // 2026-08-24) e um select com * exige acesso a toda coluna da
    // tabela mesmo num count com head:true, que não devolve linha nenhuma.
    try {
      const [adsRes, usersRes, pendingRes, reportsRes] = await Promise.all([
        supabase.from('ads').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
        // BUG CORRIGIDO (validação de 2026-08-26): 'open' não é um valor real
        // do enum de reports.status (pending/resolved/dismissed) — o KPI
        // sempre mostrava 0, mesmo com denúncia pendente de verdade.
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ])

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const newTodayRes = await supabase.from('ads').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString())

      setStats({
        adsCount: adsRes.count || 0,
        newToday: newTodayRes.count || 0,
        activeUsers: usersRes.count || 0,
        pendingAuth: pendingRes.count || 0,
        reports: reportsRes.error ? 0 : (reportsRes.count || 0),
        revenue: 0 // Keep 0 for now until payment integration is done
      })
    } catch (err) {
      // GAP CORRIGIDO: sem try/catch, uma falha de rede deixava o dashboard
      // travado em zeros sem nenhum aviso ao admin.
      showToast('Erro ao carregar estatísticas: ' + (err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Dashboard</h1>
        <p className="adm-page-sub">Visão geral do portal Tauze Class em tempo real.</p>
      </div>

      {/* Stats */}
      {/* BUG CORRIGIDO (achado de usabilidade, 2026-08-29): eram divs estáticas
          sem link nenhum, diferente do banner "Revisar Agora" de /admin/denuncias
          — cada cartão agora leva pra tela correspondente (Denúncias já filtrada
          por status=pending, mesmo recorte que o botão "Revisar Agora" usa). */}
      <div className="adm-stats-grid" style={{ marginBottom: '20px' }}>
        <Link href="/admin/usuarios" className="adm-stat-card adm-stat-card--link">
          <div>
            {loading ? <div className="adm-skel-val" /> : <div className="adm-stat-val">{stats.activeUsers}</div>}
            {/* BUG CORRIGIDO: rótulo "Ativos" mas a query conta TODO profile
                cadastrado, inclusive bloqueados (sem filtro de is_blocked,
                coluna que sequer existe em profiles) — renomeado pra bater
                com o que de fato é medido. */}
            <div className="adm-stat-lbl">Usuários Cadastrados</div>
          </div>
        </Link>
        <Link href="/admin/anuncios" className="adm-stat-card adm-stat-card--link">
          <div>
            {loading ? <div className="adm-skel-val" /> : <div className="adm-stat-val">{stats.adsCount}</div>}
            <div className="adm-stat-lbl">Total de Anúncios</div>
          </div>
        </Link>
        <Link href="/admin/assinaturas" className="adm-stat-card adm-stat-card--link">
          <div>
            {loading ? <div className="adm-skel-val" /> : <div className="adm-stat-val" style={{ fontSize: '1.4rem', color: 'var(--adm-green)' }}>R$ {stats.revenue}</div>}
            <div className="adm-stat-lbl">Receita do Mês</div>
          </div>
        </Link>
        <Link href="/admin/denuncias?status=pending" className="adm-stat-card adm-stat-card--link">
          <div>
            {loading ? <div className="adm-skel-val" /> : <div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{stats.reports}</div>}
            <div className="adm-stat-lbl">Denúncias Abertas</div>
          </div>
        </Link>
      </div>

      {/* Uso de Recursos (Supabase) */}
      <div className="adm-page-header" style={{ marginTop: '12px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--adm-text)', margin: 0 }}>Uso de Recursos (Supabase)</h2>
        <p className="adm-page-sub">Banco de dados e armazenamento de mídia — números reais, direto do Supabase.</p>
      </div>

      {usageError ? (
        <div className="adm-card" style={{ padding: '16px 20px', color: 'var(--adm-red)', fontSize: '.875rem' }}>
          {usageError}
        </div>
      ) : (
        <>
          <div className="adm-stats-grid" style={{ marginBottom: '12px' }}>
            <div className="adm-stat-card">
              <div>
                {usageLoading ? <div className="adm-skel-val" /> : <div className="adm-stat-val">{formatBytes(usage?.dbTotalBytes || 0)}</div>}
                <div className="adm-stat-lbl">Banco de Dados (Postgres)</div>
              </div>
            </div>
            <div className="adm-stat-card">
              <div>
                {usageLoading ? <div className="adm-skel-val" /> : <div className="adm-stat-val">{formatBytes(usage?.storageTotalBytes || 0)}</div>}
                <div className="adm-stat-lbl">Armazenamento (Fotos/Vídeos)</div>
              </div>
            </div>
            <div className="adm-stat-card">
              <div>
                {usageLoading ? <div className="adm-skel-val" /> : <div className="adm-stat-val">{formatRows(usage?.dbTotalRows || 0)}</div>}
                <div className="adm-stat-lbl">Registros no Banco</div>
              </div>
            </div>
            <div className="adm-stat-card">
              <div>
                {usageLoading ? <div className="adm-skel-val" /> : (
                  <div className="adm-stat-val" style={{ fontSize: '1.2rem' }}>
                    {usage?.dbTables?.[0] ? formatBytes(usage.dbTables[0].bytes) : '—'}
                  </div>
                )}
                <div className="adm-stat-lbl">
                  Maior Tabela{usage?.dbTables?.[0] ? ` (${usage.dbTables[0].table_name.replace(/^public\./, '')})` : ''}
                </div>
              </div>
            </div>
          </div>

          {!usageLoading && usage && (
            <div className="adm-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setShowDetails(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '.8rem', fontWeight: 700, color: 'var(--adm-accent)' }}
              >
                {showDetails ? '▾ Ocultar detalhes' : '▸ Ver detalhes por bucket / tabela'}
              </button>

              {showDetails && (
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginTop: '16px' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--adm-text-secondary)', marginBottom: '8px' }}>
                      Armazenamento por bucket
                    </div>
                    {usage.storageBuckets.length === 0 ? (
                      <p style={{ fontSize: '.8rem', color: 'var(--adm-text-muted)' }}>Nenhum arquivo armazenado ainda.</p>
                    ) : usage.storageBuckets.map(b => (
                      <div key={b.bucket_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', padding: '6px 0', borderBottom: '1px solid var(--adm-border)' }}>
                        <span>{BUCKET_LABELS[b.bucket_id] || b.bucket_id}</span>
                        <span style={{ color: 'var(--adm-text-secondary)' }}>{formatBytes(b.bytes)} · {b.object_count} arquivo{b.object_count === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--adm-text-secondary)', marginBottom: '8px' }}>
                      Maiores tabelas do banco
                    </div>
                    {usage.dbTables.length === 0 ? (
                      <p style={{ fontSize: '.8rem', color: 'var(--adm-text-muted)' }}>Sem dados de tabelas.</p>
                    ) : usage.dbTables.slice(0, 8).map(t => (
                      <div key={t.table_name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', padding: '6px 0', borderBottom: '1px solid var(--adm-border)' }}>
                        <span>{t.table_name.replace(/^public\./, '')}</span>
                        <span style={{ color: 'var(--adm-text-secondary)' }}>{formatBytes(t.bytes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .adm-stat-card--link { text-decoration: none; color: inherit; cursor: pointer; }
        .adm-skel-val {
          height: 28px; width: 64px; margin-bottom: 4px; border-radius: var(--adm-r-sm);
          background: linear-gradient(90deg, var(--adm-surface-2) 25%, var(--adm-surface-3) 50%, var(--adm-surface-2) 75%);
          background-size: 200% 100%;
          animation: adm-dash-skel-shine 1.4s infinite;
        }
        @keyframes adm-dash-skel-shine {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  )
}
