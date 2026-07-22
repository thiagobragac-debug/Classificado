'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminAnuncios() {
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

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
      .limit(100)
    
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
      alert(`Anúncio atualizado para ${newStatus}!`)
    } else {
      alert('Erro ao atualizar anúncio: ' + error.message)
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
          <p className="adm-page-sub">Aprove, destaque ou remova anúncios do portal.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--outline" onClick={handleExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
          <button className="adm-btn adm-btn--primary" onClick={() => alert('Modal em breve')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Anúncio
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
                <th style={{ width: '40px' }}><input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} /></th>
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
              ) : filteredAds.map(ad => (
                <tr key={ad.id}>
                  <td><input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={(ad.images && ad.images.length > 0) ? ad.images[0] : 'https://placehold.co/100x100?text=Sem+Foto'} alt="" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                      <div style={{ fontWeight: 600, color: 'var(--adm-text)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.title_pt}</div>
                    </div>
                  </td>
                  <td>{ad.profiles?.name || 'Desconhecido'}</td>
                  <td><strong>{ad.currency} {Number(ad.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                  <td>{ad.country || '-'}</td>
                  <td>
                    {ad.status === 'active' && <span className="adm-badge adm-badge--green">Ativo</span>}
                    {ad.status === 'pending' && <span className="adm-badge adm-badge--amber">Pendente</span>}
                    {ad.status === 'rejected' && <span className="adm-badge adm-badge--red">Rejeitado</span>}
                    {ad.status === 'paused' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Pausado</span>}
                    {!['active', 'pending', 'rejected', 'paused'].includes(ad.status) && <span className="adm-badge">{ad.status}</span>}
                  </td>
                  <td>{new Date(ad.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    {ad.status !== 'active' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleStatusUpdate(ad.id, 'active')}>Aprovar</button>
                    )}
                    {ad.status !== 'rejected' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleStatusUpdate(ad.id, 'rejected')}>Rejeitar</button>
                    )}
                    {ad.status === 'active' && (
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleStatusUpdate(ad.id, 'paused')}>Pausar</button>
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
