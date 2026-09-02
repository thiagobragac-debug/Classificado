'use client'

import React, { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { getCurrencySymbol } from '@/lib/currency'

export default function AdminAssinaturas() {
  const { confirm } = useConfirm()
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO (achado de usabilidade — paginação): a tela carregava até
  // 100 assinaturas de uma vez e paginava/filtrava tudo em memória, ao
  // contrário de telas irmãs (ex.: /admin/api-keys). Agora a paginação roda
  // de verdade no servidor via .range(), e os KPIs vêm de contagens/soma
  // globais separadas (loadCounts()), não do array já paginado.
  const [totalSubscriptions, setTotalSubscriptions] = useState(0)
  const [counts, setCounts] = useState({ total: 0, ativos: 0, atrasados: 0, cancelados: 0, mrrByCurrency: {} as Record<string, number> })

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('Todos')

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadSubscriptions()
  }, [currentPage, debouncedSearch, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  // BUG CORRIGIDO (validação de 2026-08-26): consulta direto do browser
  // (getSupabase(), anon key) nunca conseguia ler o e-mail de nenhum
  // assinante além do próprio admin — RLS de user_secrets só libera
  // auth.uid()=id. Agora passa por /api/admin/subscriptions
  // (service_role, mesmo padrão já usado em /admin/usuarios).
  async function loadSubscriptions() {
    setLoading(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const params = new URLSearchParams({ page: String(currentPage), pageSize: String(pageSize) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter !== 'Todos') params.set('status', statusFilter)
    const res = await fetch('/api/admin/subscriptions?' + params.toString(), {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const body = await res.json()
    if (res.ok) {
      setSubscriptions(body.subscriptions || [])
      setTotalSubscriptions(body.total || 0)
    } else {
      showToast('Erro ao carregar assinaturas: ' + (body.error || ''), 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/subscriptions?counts=true', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const body = await res.json()
    if (res.ok) {
      setCounts({
        total: body.total || 0,
        ativos: body.ativos || 0,
        atrasados: body.atrasados || 0,
        cancelados: body.cancelados || 0,
        mrrByCurrency: body.mrrByCurrency || {},
      })
    } else {
      showToast('Erro ao carregar contadores: ' + (body.error || ''), 'error')
    }
  }

  // BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): este handler
  // só fazia `subscriptions.update({status})` direto do cliente — nunca
  // cancelava de verdade no gateway (continuaria cobrando/renovando lá) nem
  // sincronizava profiles/user_secrets, então o usuário mantinha o plano
  // pago ativo pra sempre mesmo "cancelado" aqui. Cancelar agora passa pela
  // rota de servidor /api/admin/subscriptions/cancel (só ela tem acesso à
  // secret key do gateway). Reativar continua local (não existe "desfazer
  // cancelamento" genérico do lado do gateway), mas agora sincroniza
  // profiles.subscription_status também, pra não deixar os dois divergentes.
  // GAP CORRIGIDO: esta ação cancela de verdade no gateway (cobrança real,
  // ver comentário da rota) e não tinha nenhuma confirmação — um clique
  // acidental já cancelava a assinatura de um cliente de verdade.
  const handleCancel = async (id: string) => {
    if (processingId) return
    if (!(await confirm('Cancelar esta assinatura? Isso cancela a cobrança de verdade no gateway de pagamento — a ação não pode ser desfeita automaticamente.'))) return
    setProcessingId(id)
    try {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subscriptionId: id }),
      })
      const body = await res.json()
      if (res.ok) {
        loadSubscriptions()
        loadCounts()
        showToast('Assinatura cancelada.', 'success')
      } else {
        showToast('Erro ao cancelar: ' + (body.error || res.statusText), 'error')
      }
    } finally {
      setProcessingId(null)
    }
  }

  const handleReactivate = async (id: string) => {
    if (processingId) return
    setProcessingId(id)
    try {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/subscriptions/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subscriptionId: id }),
      })
      const body = await res.json()
      if (res.ok) {
        loadSubscriptions()
        loadCounts()
        showToast('Assinatura reativada.', 'success')
      } else {
        showToast('Erro ao reativar: ' + (body.error || res.statusText), 'error')
      }
    } finally {
      setProcessingId(null)
    }
  }

  // KPIs: globais, vindos de loadCounts() — não dependem da página/filtro atual
  const { total, ativos, atrasados, cancelados, mrrByCurrency } = counts
  // BUG CORRIGIDO (achado ao vivo, 2026-09-01): um card por moeda com
  // assinatura ativa — nunca soma BRL com USD (ver mrrByCurrency em
  // app/api/admin/subscriptions/route.ts). BRL sempre aparece primeiro
  // mesmo com valor 0 (é o caso normal, sem assinatura internacional).
  const mrrCurrencies = Object.keys(mrrByCurrency).includes('BRL')
    ? Object.keys(mrrByCurrency)
    : ['BRL', ...Object.keys(mrrByCurrency)]

  const totalPages = Math.ceil(totalSubscriptions / pageSize)

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Gestão de Assinaturas</h1>
        <p className="adm-page-sub">Gerencie planos, pagamentos e receita recorrente do portal.</p>
      </div>

      {/* BUG CORRIGIDO (reteste do site, 2026-08-25): `atrasados` já era
          calculado mas não tinha card nenhum no grid — uma assinatura
          past_due entrava no Total sem aparecer em nenhum indicador dedicado. */}
      <div className="adm-stats-grid" style={{ marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{atrasados}</div><div className="adm-stat-lbl">Atrasadas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{cancelados}</div><div className="adm-stat-lbl">Canceladas/Expiradas</div></div>
        </div>
        {mrrCurrencies.map(cur => (
          <div className="adm-stat-card" key={cur}>
            <div>
              <div className="adm-stat-val">{getCurrencySymbol(cur)} {(mrrByCurrency[cur] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <div className="adm-stat-lbl">Receita (MRR{mrrCurrencies.length > 1 ? ` ${cur}` : ''})</div>
            </div>
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar assinante..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="Todos">Todos os status</option>
            <option value="active">Ativa</option>
            <option value="past_due">Atrasada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Gateway</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Próxima Cobrança</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : subscriptions.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>Nenhuma assinatura encontrada.</td></tr>
              ) : subscriptions.map(sub => (
                <tr key={sub.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{sub.profiles?.name || 'Desconhecido'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>{sub.profiles?.email || '-'}</div>
                  </td>
                  <td>
                    {sub.plan === 'Premium' && <span className="adm-badge adm-badge--featured">⭐ Premium</span>}
                    {sub.plan === 'Pro' && <span className="adm-badge adm-badge--verified">🔷 Pro</span>}
                    {sub.plan !== 'Premium' && sub.plan !== 'Pro' && <span className="adm-badge">{sub.plan}</span>}
                  </td>
                  <td><span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--adm-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34D399' }}></div>{sub.gateway || 'Stripe'}</span></td>
                  {/* BUG CORRIGIDO (RESOLVER PROBLEMA DESCONTO ANUAL, achado ao
                      vivo, 2026-09-01): sub.price é o total cobrado POR
                      CICLO (ver app/api/checkout/route.ts) — numa assinatura
                      anual isso é o valor do ano inteiro. Sem indicar o
                      ciclo aqui, um admin lia "R$ 948,00" e presumia
                      cobrança mensal (mesma leitura errada que inflava o
                      card de MRR antes do fix em /api/admin/subscriptions). */}
                  <td>
                    {getCurrencySymbol(sub.currency)} {Number(sub.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}> /{sub.billing_cycle === 'annual' ? 'ano' : 'mês'}</span>
                  </td>
                  <td>
                    {sub.status === 'active' && <span className="adm-badge adm-badge--green">Ativa</span>}
                    {sub.status === 'past_due' && <span className="adm-badge adm-badge--amber">Atrasada</span>}
                    {sub.status === 'cancelled' && <span className="adm-badge adm-badge--red">Cancelada</span>}
                    {!['active', 'past_due', 'cancelled'].includes(sub.status) && <span className="adm-badge">{sub.status}</span>}
                  </td>
                  {/* BUG CORRIGIDO (validação do zero, 3ª rodada): next_billing_at
                      nunca é escrito por nenhum caminho de código — coluna morta,
                      "-" garantido sempre. current_period_end é a coluna real,
                      atualizada tanto na criação/renovação quanto na troca de
                      plano nativa. */}
                  <td>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      {/* BUG CORRIGIDO (validação do zero, rodada 6): só mostrava
                          Cancelar pra 'active'/'past_due' — uma assinatura travada em
                          'pending' ou 'expired' (a rota /api/admin/subscriptions/cancel
                          já aceita cancelar qualquer status != 'cancelled') ficava sem
                          NENHUM botão de ação pro admin. */}
                      {sub.status !== 'cancelled' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} disabled={processingId === sub.id} onClick={() => handleCancel(sub.id)}>Cancelar</button>
                      )}
                      {sub.status === 'cancelled' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" disabled={processingId === sub.id} onClick={() => handleReactivate(sub.id)}>Reativar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* PAGINATION FOOTER */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
          <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
            Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalSubscriptions === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalSubscriptions)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalSubscriptions}</strong> itens
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="adm-btn adm-btn--outline adm-btn--sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              Anterior
            </button>

            {Array.from({ length: totalPages }).map((_, i) => {
              if (totalPages > 7) {
                if (i !== 0 && i !== totalPages - 1 && Math.abs(currentPage - 1 - i) > 1) {
                  if (Math.abs(currentPage - 1 - i) === 2) return <span key={i} style={{ padding: '0 8px', color: 'var(--adm-text-secondary)' }}>...</span>
                  return null
                }
              }

              return (
                <button
                  key={i}
                  className={`adm-btn adm-btn--sm ${currentPage === i + 1 ? 'adm-btn--primary' : 'adm-btn--outline'}`}
                  style={{ width: '36px', height: '36px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </button>
              )
            })}

            <button
              className="adm-btn adm-btn--outline adm-btn--sm"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
