'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminAssinaturas() {
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')

  useEffect(() => {
    loadSubscriptions()
  }, [])

  // BUG CORRIGIDO (validação de 2026-08-26): consulta direto do browser
  // (getSupabase(), anon key) nunca conseguia ler o e-mail de nenhum
  // assinante além do próprio admin — RLS de user_secrets só libera
  // auth.uid()=id. Agora passa por /api/admin/subscriptions
  // (service_role, mesmo padrão já usado em /admin/usuarios).
  async function loadSubscriptions() {
    setLoading(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/subscriptions', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const body = await res.json()
    if (res.ok) {
      setSubscriptions(body.subscriptions || [])
    } else {
      showToast('Erro ao carregar assinaturas: ' + (body.error || ''), 'error')
    }
    setLoading(false)
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
  const handleCancel = async (id: string) => {
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/subscriptions/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ subscriptionId: id }),
    })
    const body = await res.json()
    if (res.ok) {
      setSubscriptions(subscriptions.map(s => s.id === id ? { ...s, status: 'cancelled' } : s))
      showToast('Assinatura cancelada.', 'success')
    } else {
      showToast('Erro ao cancelar: ' + (body.error || res.statusText), 'error')
    }
  }

  const handleReactivate = async (id: string) => {
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/subscriptions/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ subscriptionId: id }),
    })
    const body = await res.json()
    if (res.ok) {
      setSubscriptions(subscriptions.map(s => s.id === id ? { ...s, status: 'active' } : s))
      showToast('Assinatura reativada.', 'success')
    } else {
      showToast('Erro ao reativar: ' + (body.error || res.statusText), 'error')
    }
  }

  const filteredSubscriptions = subscriptions.filter(s => {
    if (search && !(s.profiles?.name?.toLowerCase().includes(search.toLowerCase()) || s.profiles?.email?.toLowerCase().includes(search.toLowerCase()))) return false
    if (statusFilter !== 'Todos' && s.status !== statusFilter) return false
    return true
  })

  // BUG CORRIGIDO: os valores de status aqui ('overdue'/'canceled') nunca
  // batiam com os valores reais gravados pelo webhook/checkout ('past_due'/
  // 'cancelled', 2 L) — qualquer atraso ou cancelamento vindo do fluxo real
  // ficava com KPI zerado, badge cru sem estilo, e SEM NENHUM botão de ação
  // na tela (a linha não caía em nenhuma das condições de renderização).
  // KPIs
  const total = subscriptions.length
  const ativos = subscriptions.filter(s => s.status === 'active').length
  const atrasados = subscriptions.filter(s => s.status === 'past_due').length
  const cancelados = subscriptions.filter(s => s.status === 'cancelled').length
  
  // MRR sum of active
  const mrr = subscriptions.filter(s => s.status === 'active').reduce((acc, curr) => acc + (curr.price || 0), 0)

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Gestão de Assinaturas</h1>
        <p className="adm-page-sub">Gerencie planos, pagamentos e receita recorrente do portal.</p>
      </div>

      {/* BUG CORRIGIDO (reteste do site, 2026-08-25): `atrasados` já era
          calculado mas não tinha card nenhum no grid — uma assinatura
          past_due entrava no Total sem aparecer em nenhum indicador dedicado. */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: '20px' }}>
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
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{cancelados}</div><div className="adm-stat-lbl">Canceladas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="adm-stat-lbl">Receita (MRR)</div></div>
        </div>
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
              ) : filteredSubscriptions.map(sub => (
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
                  <td>R$ {Number(sub.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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
                      {(sub.status === 'active' || sub.status === 'past_due') && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleCancel(sub.id)}>Cancelar</button>
                      )}
                      {sub.status === 'cancelled' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleReactivate(sub.id)}>Reativar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
