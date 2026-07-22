'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminAssinaturas() {
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')

  useEffect(() => {
    loadSubscriptions()
  }, [])

  async function loadSubscriptions() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, profiles!user_id(name, email)')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (!error && data) {
      setSubscriptions(data)
    }
    setLoading(false)
  }

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('subscriptions').update({ status: newStatus }).eq('id', id)
    if (!error) {
      setSubscriptions(subscriptions.map(s => s.id === id ? { ...s, status: newStatus } : s))
      alert(`Status alterado para ${newStatus}`)
    } else {
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const filteredSubscriptions = subscriptions.filter(s => {
    if (search && !(s.profiles?.name?.toLowerCase().includes(search.toLowerCase()) || s.profiles?.email?.toLowerCase().includes(search.toLowerCase()))) return false
    if (statusFilter !== 'Todos' && s.status !== statusFilter) return false
    return true
  })

  // KPIs
  const total = subscriptions.length
  const ativos = subscriptions.filter(s => s.status === 'active').length
  const atrasados = subscriptions.filter(s => s.status === 'overdue').length
  const cancelados = subscriptions.filter(s => s.status === 'canceled').length
  
  // MRR sum of active
  const mrr = subscriptions.filter(s => s.status === 'active').reduce((acc, curr) => acc + (curr.price || 0), 0)

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Gestão de Assinaturas</h1>
        <p className="adm-page-sub">Gerencie planos, pagamentos e receita recorrente do portal.</p>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="adm-stat-lbl">MRR (Mensal)</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativas</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{atrasados}</div><div className="adm-stat-lbl">Atrasadas</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{cancelados}</div><div className="adm-stat-lbl">Canceladas</div></div>
          <div className="adm-stat-icon adm-stat-icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
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
            <option value="overdue">Atrasada</option>
            <option value="canceled">Cancelada</option>
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
                    {sub.status === 'overdue' && <span className="adm-badge adm-badge--amber">Atrasada</span>}
                    {sub.status === 'canceled' && <span className="adm-badge adm-badge--red">Cancelada</span>}
                    {!['active', 'overdue', 'canceled'].includes(sub.status) && <span className="adm-badge">{sub.status}</span>}
                  </td>
                  <td>{sub.next_billing_at ? new Date(sub.next_billing_at).toLocaleDateString() : '-'}</td>
                  <td style={{ textAlign: 'right', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {sub.status === 'active' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleUpdateStatus(sub.id, 'canceled')}>Cancelar</button>
                    )}
                    {sub.status === 'canceled' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleUpdateStatus(sub.id, 'active')}>Reativar</button>
                    )}
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
