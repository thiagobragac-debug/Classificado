'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminLeiloes() {
  const [auctions, setAuctions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadAuctions()
  }, [])

  async function loadAuctions() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('auction_events')
      .select('*')
      .order('date', { ascending: false })
    
    if (!error && data) {
      setAuctions(data)
    }
    setLoading(false)
  }

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('auction_events').update({ status: newStatus }).eq('id', id)
    if (!error) {
      setAuctions(auctions.map(a => a.id === id ? { ...a, status: newStatus } : a))
      alert(`Status do leilão atualizado para ${newStatus}!`)
    } else {
      alert('Erro ao atualizar status: ' + error.message)
    }
  }

  const filteredAuctions = auctions.filter(a => {
    if (search && !a.title?.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && a.status !== statusFilter) return false
    return true
  })

  // KPIs
  const total = auctions.length
  const emAndamento = auctions.filter(a => a.status === 'aovivo').length
  const agendados = auctions.filter(a => a.status === 'agendado').length

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gestão de Leilões e Remates</h1>
          <p className="adm-page-sub">Crie eventos, gerencie transmissões e associe lotes.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--primary" onClick={() => alert('Modal em breve')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Leilão
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{emAndamento}</div><div className="adm-stat-lbl">Ao Vivo</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{agendados}</div><div className="adm-stat-lbl">Agendados</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por título..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="agendado">Agendado</option>
            <option value="aovivo">Ao Vivo</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data / Hora</th>
                <th>Status</th>
                <th>Lotes</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : filteredAuctions.map(auc => (
                <tr key={auc.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={auc.cover || 'https://placehold.co/100x100?text=Sem+Capa'} alt="" style={{ width: '60px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                      <div style={{ fontWeight: 600 }}>{auc.title}</div>
                    </div>
                  </td>
                  <td>{new Date(auc.date).toLocaleString('pt-BR')}</td>
                  <td>
                    {auc.status === 'aovivo' && <span className="adm-badge adm-badge--red">Ao Vivo</span>}
                    {auc.status === 'agendado' && <span className="adm-badge adm-badge--amber">Agendado</span>}
                    {auc.status === 'finalizado' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Finalizado</span>}
                    {!['aovivo', 'agendado', 'finalizado'].includes(auc.status) && <span className="adm-badge">{auc.status}</span>}
                  </td>
                  <td>-</td>
                  <td style={{ textAlign: 'right', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {auc.status === 'agendado' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleStatusUpdate(auc.id, 'aovivo')}>Iniciar</button>
                    )}
                    {auc.status === 'aovivo' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleStatusUpdate(auc.id, 'finalizado')}>Finalizar</button>
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
