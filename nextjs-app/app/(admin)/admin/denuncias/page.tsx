'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminDenuncias() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('reports')
      .select('*, ads(title_pt), profiles!reporter_id(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (!error && data) {
      setReports(data)
    }
    setLoading(false)
  }

  const handleResolve = async (id: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      setReports(reports.map(r => r.id === id ? { ...r, status: 'resolved' } : r))
      alert('Denúncia resolvida com sucesso!')
    } else {
      alert('Erro ao resolver: ' + error.message)
    }
  }

  const handleResolveAll = async () => {
    if (!confirm('Tem certeza que deseja resolver TODAS as denúncias filtradas?')) return
    const supabase = getSupabase()
    const idsToResolve = filteredReports.filter(r => r.status === 'pending').map(r => r.id)
    if (idsToResolve.length === 0) return alert('Nenhuma denúncia pendente nos filtros atuais.')

    const { error } = await supabase.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).in('id', idsToResolve)
    if (!error) {
      setReports(reports.map(r => idsToResolve.includes(r.id) ? { ...r, status: 'resolved' } : r))
      alert(`${idsToResolve.length} denúncias resolvidas!`)
    } else {
      alert('Erro ao resolver: ' + error.message)
    }
  }

  const filteredReports = reports.filter(r => {
    if (search && !(r.ads?.title_pt?.toLowerCase().includes(search.toLowerCase()) || r.profiles?.name?.toLowerCase().includes(search.toLowerCase()))) return false
    if (severityFilter && r.severity !== severityFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  // KPIs
  const total = reports.length
  const pendentes = reports.filter(r => r.status === 'pending').length
  const altaGravidade = reports.filter(r => r.severity === 'high' && r.status === 'pending').length
  const resolvidas = reports.filter(r => r.status === 'resolved').length

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Central de Denúncias</h1>
        <p className="adm-page-sub">Gerencie os anúncios denunciados pelos usuários do portal.</p>
      </div>

      {altaGravidade > 0 && (
        <div style={{ display: 'flex', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 'var(--adm-r-md)', padding: '12px 16px', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--adm-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ fontSize: '.875rem', color: 'var(--adm-red)', fontWeight: 600 }}>{altaGravidade} denúncia{altaGravidade > 1 ? 's' : ''} de alta gravidade requerem atenção imediata.</span>
        </div>
      )}

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total Denúncias</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></div>
        </div>
        <div className="adm-stat-card" style={{ borderColor: 'rgba(245,158,11,.3)' }}>
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{pendentes}</div><div className="adm-stat-lbl">Pendentes</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        </div>
        <div className="adm-stat-card" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{altaGravidade}</div><div className="adm-stat-lbl">Alta Gravidade</div></div>
          <div className="adm-stat-icon adm-stat-icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{resolvidas}</div><div className="adm-stat-lbl">Resolvidas</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por anúncio ou denunciante..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
            <option value="">Todas as gravidades</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Resolvida</option>
          </select>
          <button className="adm-btn adm-btn--danger adm-btn--sm" onClick={handleResolveAll}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Resolver todas
          </button>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Anúncio Denunciado</th>
                <th>Denunciante</th>
                <th>Motivo</th>
                <th>Gravidade</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : filteredReports.map((rep, idx) => (
                <tr key={rep.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{rep.ads?.title_pt || 'Anúncio Excluído'}</td>
                  <td>{rep.profiles?.name || 'Desconhecido'}</td>
                  <td>{rep.reason}</td>
                  <td>
                    {rep.severity === 'high' && <span className="adm-badge adm-badge--red">Alta</span>}
                    {rep.severity === 'medium' && <span className="adm-badge adm-badge--amber">Média</span>}
                    {rep.severity === 'low' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Baixa</span>}
                  </td>
                  <td>
                    {rep.status === 'pending' ? (
                      <span className="adm-badge adm-badge--amber">Pendente</span>
                    ) : (
                      <span className="adm-badge adm-badge--green">Resolvida</span>
                    )}
                  </td>
                  <td>{new Date(rep.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    {rep.status === 'pending' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleResolve(rep.id)}>Resolver</button>
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
