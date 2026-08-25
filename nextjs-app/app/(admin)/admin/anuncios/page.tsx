'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, Eye, ExternalLink } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { imageUrl } from '@/lib/storage'
import { showToast } from '@/lib/toast'

export default function AdminAnuncios() {
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    loadAds()
    loadCategories()
  }, [])

  async function loadAds() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('ads')
      .select('*, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(1500)
    
    if (!error && data) {
      setAds(data)
    }
    setLoading(false)
  }

  async function loadCategories() {
    const supabase = getSupabase()
    const { data } = await supabase.from('categories').select('id, name_pt').order('sort_order', { ascending: true })
    if (data) setCategories(data)
  }

  const handleStatusUpdate = async (adId: string, newStatus: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('ads').update({ status: newStatus }).eq('id', adId)
    if (!error) {
      setAds(ads.map(a => a.id === adId ? { ...a, status: newStatus } : a))
      showToast(`Anúncio atualizado para ${newStatus}!`, 'success')
    } else {
      showToast('Erro ao atualizar anúncio: ' + error.message, 'error')
    }
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.length === 0) return
    const supabase = getSupabase()

    // BUG CORRIGIDO (teste do plano Grátis, 2026-08-25): um único .update()
    // com .in() é uma transação só — se qualquer anúncio do lote esbarrasse
    // na cota de anúncios do dono (trigger enforce_ad_quota), a transação
    // inteira abortava e NENHUM anúncio selecionado era aprovado, sem
    // indicar qual causou o erro. Atualizando um por um, os que podem ser
    // aprovados são aprovados, e os que falham continuam selecionados (e
    // identificáveis) pro admin decidir o que fazer.
    const results = await Promise.all(selectedIds.map(async id => {
      const { error } = await supabase.from('ads').update({ status: newStatus }).eq('id', id)
      return { id, error }
    }))

    const succeededIds = results.filter(r => !r.error).map(r => r.id)
    const failed = results.filter(r => r.error)

    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds)
      setAds(ads.map(a => succeededSet.has(a.id) ? { ...a, status: newStatus } : a))
    }

    if (failed.length === 0) {
      showToast(`${succeededIds.length} anúncios atualizados para ${newStatus}!`, 'success')
    } else if (succeededIds.length === 0) {
      showToast(`Nenhum anúncio atualizado. Erro: ${failed[0].error.message}`, 'error')
    } else {
      showToast(`${succeededIds.length} atualizados, ${failed.length} falharam: ${failed[0].error.message}`, 'error')
    }

    setSelectedIds(failed.map(r => r.id)) // mantém selecionados só os que falharam, pra inspeção
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAds.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredAds.map(a => a.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleExport = () => {
    const headers = ['ID', 'Título', 'Vendedor', 'Categoria', 'Preço', 'País', 'Status', 'Data']
    const rows = filteredAds.map(a => [
      a.id,
      a.title_pt || '',
      a.profiles?.name || '',
      a.category_id || '',
      a.price || 0,
      a.country || '',
      a.status || '',
      new Date(a.created_at).toLocaleDateString()
    ])
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "anuncios_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredAds = ads.filter(a => {
    if (search && !(a.title_pt?.toLowerCase().includes(search.toLowerCase()) || a.profiles?.name?.toLowerCase().includes(search.toLowerCase()))) return false
    if (statusFilter && a.status !== statusFilter) return false
    if (categoryFilter && a.category_id !== categoryFilter) return false
    if (countryFilter && !a.country?.toLowerCase().includes(countryFilter.toLowerCase())) return false
    return true
  })

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, categoryFilter, countryFilter])

  // Pagination logic
  const totalPages = Math.ceil(filteredAds.length / pageSize)
  const paginatedAds = filteredAds.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // KPIs
  const total = ads.length
  const ativos = ads.filter(a => a.status === 'active').length
  const pendentes = ads.filter(a => a.status === 'pending').length
  const rejeitados = ads.filter(a => a.status === 'rejected').length

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gerenciar Anúncios</h1>
          {/* GAP CORRIGIDO (auditoria completa, 2026-08-25): o subtítulo
              prometia "destaque" e "remova", mas esta tela nunca teve botão
              de destacar (featured) nem de excluir — só aprovar/rejeitar/
              pausar (individual e em massa). Texto ajustado pra descrever
              o que a tela realmente faz. */}
          <p className="adm-page-sub">Aprove, rejeite ou pause anúncios do portal.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--outline" onClick={handleExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Mini Stats */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{ativos}</div><div className="adm-stat-lbl">Ativos</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{pendentes}</div><div className="adm-stat-lbl">Pendentes</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{rejeitados}</div><div className="adm-stat-lbl">Rejeitados</div></div>
          <div className="adm-stat-icon adm-stat-icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por título ou vendedor..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="pending">Pendente</option>
            <option value="rejected">Rejeitado</option>
          </select>
          <select className="adm-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
          </select>
          <select className="adm-select" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">Todos os países</option>
            <option value="brasil">Brasil</option>
            <option value="argentina">Argentina</option>
            <option value="uruguai">Uruguai</option>
            <option value="paraguai">Paraguai</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    style={{ accentColor: 'var(--adm-accent)' }} 
                    checked={filteredAds.length > 0 && selectedIds.length === filteredAds.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Anúncio</th>
                <th>Vendedor</th>
                <th>Preço</th>
                <th>País</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : paginatedAds.map(ad => (
                <tr key={ad.id} style={{ background: selectedIds.includes(ad.id) ? 'var(--adm-surface-2)' : 'transparent' }}>
                  <td>
                    <input 
                      type="checkbox" 
                      style={{ accentColor: 'var(--adm-accent)' }} 
                      checked={selectedIds.includes(ad.id)}
                      onChange={() => toggleSelect(ad.id)}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={imageUrl((ad.images && ad.images.length > 0) ? ad.images[0] : null, 'https://placehold.co/100x100?text=Sem+Foto')} alt="" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                      <Link href={`/anuncio/${ad.id}`} target="_blank" style={{ fontWeight: 600, color: 'var(--adm-text)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} title="Visualizar Anúncio">
                        {ad.title_pt}
                      </Link>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ad.profiles?.name || 'Desconhecido'}>
                    {ad.profiles?.name || 'Desconhecido'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}><strong>{ad.currency} {Number(ad.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{ad.country || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {ad.status === 'active' && <span className="adm-badge adm-badge--green">Ativo</span>}
                    {ad.status === 'pending' && <span className="adm-badge adm-badge--amber">Pendente</span>}
                    {ad.status === 'rejected' && <span className="adm-badge adm-badge--red">Rejeitado</span>}
                    {ad.status === 'paused' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Pausado</span>}
                    {!['active', 'pending', 'rejected', 'paused'].includes(ad.status) && <span className="adm-badge">{ad.status}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(ad.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {ad.status !== 'active' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleStatusUpdate(ad.id, 'active')} title="Aprovar">Aprovar</button>
                      )}
                      {ad.status !== 'rejected' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleStatusUpdate(ad.id, 'rejected')} title="Rejeitar">Rejeitar</button>
                      )}
                      {ad.status === 'active' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleStatusUpdate(ad.id, 'paused')} title="Pausar">Pausar</button>
                      )}
                      <Link href={`/anuncio/${ad.id}`} target="_blank" className="adm-btn adm-btn--sm adm-btn--outline" style={{ display: 'grid', placeItems: 'center', padding: '0 8px' }} title="Visualizar Anúncio na Loja">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                      </Link>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{filteredAds.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, filteredAds.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{filteredAds.length}</strong> anúncios
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
                // Show max 5 page buttons to avoid overflow
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
            <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setSelectedIds([])}>
              Cancelar
            </button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleBulkStatusUpdate('active')}>
              Aprovar Todos
            </button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleBulkStatusUpdate('rejected')}>
              Rejeitar Todos
            </button>
          </div>
        </div>
      )}
    </>
  )
}
