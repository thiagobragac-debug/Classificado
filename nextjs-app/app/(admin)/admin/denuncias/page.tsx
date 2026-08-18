'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminDenuncias() {
  const { confirm } = useConfirm()
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  
  const [selectedIds, setSelectedIds] = useState<string[]>([])

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
      .limit(1500)
    
    if (!error && data) {
      setReports(data)
    }
    setLoading(false)
  }

  const handleDismiss = async (id: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('reports').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      setReports(reports.map(r => r.id === id ? { ...r, status: 'dismissed' } : r))
      showToast('Denúncia marcada como falso positivo.', 'success')
    } else {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const handleBanAd = async (reportId: string, adId: string) => {
    if (!(await confirm('Tem certeza que deseja banir/rejeitar este anúncio permanentemente?'))) return
    const supabase = getSupabase()
    
    // Primeiro banimos o anúncio (mudamos status para rejected)
    const { error: adError } = await supabase.from('ads').update({ status: 'rejected' }).eq('id', adId)
    
    if (adError) {
      return showToast('Erro ao banir anúncio: ' + adError.message, 'error')
    }
    
    // Depois, resolvemos automaticamente a denúncia
    const { error: reportError } = await supabase.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', reportId)
    
    if (!reportError) {
      setReports(reports.map(r => r.id === reportId ? { ...r, status: 'resolved' } : r))
      showToast('Anúncio banido e denúncia resolvida com sucesso!', 'success')
    } else {
      showToast('Anúncio banido, mas houve erro ao fechar a denúncia.', 'error')
    }
  }

  const handleRevert = async (id: string, adId: string | null) => {
    if (!(await confirm('Deseja reverter esta denúncia para pendente? (O anúncio voltará para revisão caso tenha sido banido)'))) return
    const supabase = getSupabase()
    
    if (adId) {
      // Volta o anúncio para pending para ser analisado novamente
      await supabase.from('ads').update({ status: 'pending' }).eq('id', adId)
    }
    
    const { error } = await supabase.from('reports').update({ status: 'pending', resolved_at: null }).eq('id', id)
    
    if (!error) {
      setReports(reports.map(r => r.id === id ? { ...r, status: 'pending' } : r))
      showToast('Decisão revertida! Denúncia e anúncio de volta para análise.', 'success')
    } else {
      showToast('Erro ao reverter: ' + error.message, 'error')
    }
  }

  const handleResolveAll = async () => {
    if (!(await confirm('Tem certeza que deseja resolver TODAS as denúncias filtradas?'))) return
    const supabase = getSupabase()
    const idsToResolve = filteredReports.filter(r => r.status === 'pending').map(r => r.id)
    if (idsToResolve.length === 0) return showToast('Nenhuma denúncia pendente nos filtros atuais.', 'success')

    const { error } = await supabase.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).in('id', idsToResolve)
    if (!error) {
      setReports(reports.map(r => idsToResolve.includes(r.id) ? { ...r, status: 'resolved' } : r))
      showToast(`${idsToResolve.length} denúncias resolvidas!`, 'success')
    } else {
      showToast('Erro ao atualizar denúncia: ' + error.message, 'error')
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedReports.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(paginatedReports.map(r => r.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.length === 0) return
    const supabase = getSupabase()
    
    const { error } = await supabase.from('reports')
      .update({ status: newStatus })
      .in('id', selectedIds)
      
    if (!error) {
      setReports(reports.map(r => selectedIds.includes(r.id) ? { ...r, status: newStatus } : r))
      showToast(`${selectedIds.length} denúncias marcadas como ${newStatus}!`, 'success')
      setSelectedIds([])
    } else {
      showToast('Erro ao atualizar denúncias: ' + error.message, 'error')
    }
  }

  const filteredReports = reports.filter(r => {
    if (search && !(r.ads?.title_pt?.toLowerCase().includes(search.toLowerCase()) || r.profiles?.name?.toLowerCase().includes(search.toLowerCase()))) return false
    if (severityFilter && r.severity !== severityFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [search, severityFilter, statusFilter])

  const totalPages = Math.ceil(filteredReports.length / pageSize)
  const paginatedReports = filteredReports.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // KPIs
  const total = reports.length
  const pendentes = reports.filter(r => r.status === 'pending').length
  const altaGravidade = reports.filter(r => r.severity === 'high' && r.status === 'pending').length
  const resolvidas = reports.filter(r => r.status === 'resolved' || r.status === 'dismissed').length

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Central de Denúncias</h1>
        <p className="adm-page-sub">Gerencie os anúncios denunciados pelos usuários do portal.</p>
      </div>

      {altaGravidade > 0 && (
        <div style={{
          display: 'flex',
          background: 'linear-gradient(to right, rgba(239,68,68,0.1), rgba(239,68,68,0.02))',
          border: '1px solid rgba(239,68,68,0.3)',
          borderLeft: '4px solid var(--adm-red)',
          borderRadius: 'var(--adm-r-md)',
          padding: '16px 20px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          boxShadow: '0 4px 12px rgba(239,68,68,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              background: 'rgba(239,68,68,0.15)',
              borderRadius: '50%',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--adm-red)'
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--adm-red)', fontWeight: 600 }}>Ação Necessária</h4>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--adm-text-secondary)' }}>
                Existem <strong style={{ color: 'var(--adm-text)', fontWeight: 600 }}>{altaGravidade}</strong> denúncia{altaGravidade > 1 ? 's' : ''} de alta gravidade que requer{altaGravidade > 1 ? 'em' : ''} atenção imediata.
              </p>
            </div>
          </div>
          <button 
            className="adm-btn adm-btn--sm" 
            style={{ background: 'var(--adm-red)', color: '#fff', borderColor: 'var(--adm-red)' }}
            onClick={() => {
              setSeverityFilter('high')
              setStatusFilter('pending')
            }}
          >
            Revisar Agora
          </button>
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
            <option value="resolved">Banido (Ação Tomada)</option>
            <option value="dismissed">Falso Positivo</option>
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
                <th style={{ width: '40px' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }}
                         checked={paginatedReports.length > 0 && selectedIds.length === paginatedReports.length}
                         onChange={toggleSelectAll} />
                </th>
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
              ) : paginatedReports.map(rep => (
                <tr key={rep.id} style={{ background: selectedIds.includes(rep.id) ? 'var(--adm-surface-2)' : 'transparent' }}>
                  <td>
                    <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }}
                           checked={selectedIds.includes(rep.id)}
                           onChange={() => toggleSelect(rep.id)} />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {rep.ads?.title_pt ? (
                      <Link href={`/anuncio/${rep.ad_id}`} target="_blank" style={{ color: 'var(--adm-text)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }} title="Abrir Anúncio em Nova Aba">
                        {rep.ads.title_pt}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--adm-text-secondary)' }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                      </Link>
                    ) : (
                      'Anúncio Excluído'
                    )}
                  </td>
                  <td>{rep.profiles?.name || 'Desconhecido'}</td>
                  <td>{rep.reason}</td>
                  <td>
                    {rep.severity === 'high' && <span className="adm-badge adm-badge--red">Alta</span>}
                    {rep.severity === 'medium' && <span className="adm-badge adm-badge--amber">Média</span>}
                    {rep.severity === 'low' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Baixa</span>}
                  </td>
                  <td>
                    {rep.status === 'pending' && (
                      <span className="adm-badge adm-badge--amber">Pendente</span>
                    )}
                    {rep.status === 'resolved' && (
                      <span className="adm-badge adm-badge--green">Banido (Ação Tomada)</span>
                    )}
                    {rep.status === 'dismissed' && (
                      <span className="adm-badge" style={{ background: 'var(--adm-surface-3)', color: 'var(--adm-text-muted)' }}>Falso Positivo</span>
                    )}
                  </td>
                  <td>{new Date(rep.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {rep.status === 'pending' ? (
                        <>
                          <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleDismiss(rep.id)} title="Marcar como falso positivo e ignorar">Ignorar (Falso)</button>
                          {rep.ad_id && (
                            <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleBanAd(rep.id, rep.ad_id)} title="Banir Anúncio e fechar denúncia">Banir</button>
                          )}
                        </>
                      ) : (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleRevert(rep.id, rep.ad_id)} title="Reverter decisão">Reverter</button>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, filteredReports.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{filteredReports.length}</strong> itens
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
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
      </div>

      {selectedIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--adm-surface)', border: '1px solid var(--adm-border)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '12px 24px',
          borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000
        }}>
          <div style={{ fontWeight: 600, color: 'var(--adm-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderLeft: '1px solid var(--adm-border)', paddingLeft: '20px' }}>
            <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setSelectedIds([])}>Cancelar</button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-accent)', borderColor: 'var(--adm-accent)', color: '#fff' }} onClick={() => handleBulkStatusUpdate('resolved')}>Marcar como Resolvidas</button>
            <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleBulkStatusUpdate('dismissed')}>Ignorar (Falso Positivo)</button>
          </div>
        </div>
      )}
    </>
  )
}
