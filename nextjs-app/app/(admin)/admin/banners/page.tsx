'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminBanners() {
  const { confirm } = useConfirm()
  const [banners, setBanners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  const [form, setForm] = useState({
    name: '',
    position: 'home_top',
    status: 'active',
    image_url: '',
    link_url: '',
    target_type: 'global',
    target_location: ''
  })

  useEffect(() => {
    loadBanners()
  }, [])

  async function loadBanners() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase.from('banners').select('*').order('created_at', { ascending: false }).limit(1500)
    if (!error && data) {
      setBanners(data)
    }
    setLoading(false)
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    const supabase = getSupabase()
    const { error } = await supabase.from('banners').update({ status: newStatus }).eq('id', id)
    if (!error) {
      setBanners(banners.map(b => b.id === id ? { ...b, status: newStatus } : b))
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const supabase = getSupabase()
    const ext = file.name.split('.').pop()
    const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(2,7)}.${ext}`
    
    const { error } = await supabase.storage.from('ads-images').upload(fileName, file)
    if (error) {
      showToast('Erro no upload: ' + error.message, 'error')
    } else {
      const { data: { publicUrl } } = supabase.storage.from('ads-images').getPublicUrl(fileName)
      setForm(prev => ({ ...prev, image_url: publicUrl }))
      showToast('Imagem carregada com sucesso!', 'success')
    }
    setUploadingImage(false)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm('Deseja realmente excluir este banner?'))) return
    const supabase = getSupabase()
    const { error } = await supabase.from('banners').delete().eq('id', id)
    if (!error) {
      setBanners(banners.filter(b => b.id !== id))
    } else {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({
      name: '', position: 'home_top', status: 'active', image_url: '', link_url: '', target_type: 'global', target_location: ''
    })
    setIsModalOpen(true)
  }

  const openEdit = (b: any) => {
    setEditingId(b.id)
    setForm({
      name: b.name || '',
      position: b.position || 'home_top',
      status: b.status || 'active',
      image_url: b.image_url || '',
      link_url: b.link_url || '',
      target_type: b.target_type || 'global',
      target_location: b.target_location || ''
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.image_url) return showToast('Preencha o nome e a URL da imagem', 'error')
    
    const supabase = getSupabase()
    const payload = {
      ...form
    }

    if (editingId) {
      const { error } = await supabase.from('banners').update(payload).eq('id', editingId)
      if (!error) {
        setBanners(banners.map(b => b.id === editingId ? { ...b, ...payload } : b))
        setIsModalOpen(false)
        showToast('Banner atualizado!', 'success')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      const { data, error } = await supabase.from('banners').insert(payload).select().single()
      if (!error && data) {
        setBanners([data, ...banners])
        setIsModalOpen(false)
        showToast('Banner criado!', 'success')
      } else {
        showToast('Erro: ' + error?.message, 'error')
      }
    }
  }

  // KPIs
  const total = banners.length
  const ativos = banners.filter(b => b.status === 'active').length
  const inativos = banners.filter(b => b.status === 'inactive').length
  const globais = banners.filter(b => b.target_type === 'global').length

  const totalPages = Math.ceil(banners.length / pageSize)
  const paginatedBanners = banners.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gestão de Banners</h1>
          <p className="adm-page-sub">Monetize o portal gerenciando os anúncios e banners publicitários.</p>
        </div>
        <button className="adm-btn adm-btn--primary" onClick={openNew}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Banner
        </button>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Banners</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativos</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{inativos}</div><div className="adm-stat-lbl">Inativos / Pausados</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{globais}</div><div className="adm-stat-lbl">Globais</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Visualização</th>
                <th>Nome da Campanha</th>
                <th>Posição / Alvo</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Carregando banners...</td></tr>
              ) : banners.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Nenhum banner encontrado.</td></tr>
              ) : paginatedBanners.map(b => (
                <tr key={b.id}>
                  <td>
                    {b.image_url ? (
                      <div style={{ width: '100px', height: '50px', backgroundImage: `url(${b.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '4px', border: '1px solid var(--adm-border)' }}></div>
                    ) : (
                      <div style={{ width: '100px', height: '50px', background: 'var(--adm-surface-2)', borderRadius: '4px', border: '1px solid var(--adm-border)' }}></div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    {b.link_url && <a href={b.link_url} target="_blank" style={{ fontSize: '0.8rem', color: 'var(--adm-primary)', textDecoration: 'none' }} title={b.link_url}>🔗 Ver Link</a>}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>Posição: <strong style={{ color: 'var(--adm-text)' }}>{b.position}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>Alvo: {b.target_type} {b.target_location ? `(${b.target_location})` : ''}</div>
                  </td>
                  <td>
                    {b.status === 'active' ? <span className="adm-badge adm-badge--green">Ativo</span> : <span className="adm-badge adm-badge--amber">Inativo</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(b)}>Editar</button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleToggleStatus(b.id, b.status)}>
                        {b.status === 'active' ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(b.id)}>Excluir</button>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, banners.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{banners.length}</strong> itens
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

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* 1. FIXED HEADER */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Banner' : 'Novo Banner'}
              </h3>
            </div>
            
            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div className="adm-field">
                <label>Nome da Campanha / Anunciante</label>
                <input type="text" className="adm-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sementes AgroMais" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Posição do Banner</label>
                  <select className="adm-select" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                    <option value="home_top">Home - Topo (Leaderboard)</option>
                    <option value="home_mid">Home - Meio (Leaderboard)</option>
                    <option value="listagem_sidebar">Listagem - Sidebar (Retângulo)</option>
                    <option value="anuncio_sidebar">Anúncio - Sidebar (Retângulo)</option>
                    <option value="leilao_footer">Leilão - Rodapé (Horizontal)</option>
                  </select>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '6px' }}>
                    {form.position.includes('sidebar') 
                      ? 'Recomendado: 300x250px ou 300x600px'
                      : 'Recomendado: 1200x120px (Desktop) / 320x100px (Mobile)'}
                  </div>
                </div>
                <div className="adm-field">
                  <label>Status</label>
                  <select className="adm-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
                <div className="adm-field">
                  <label>Abrangência</label>
                  <select className="adm-select" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value, target_location: '' })}>
                    <option value="global">Global (Todos)</option>
                    <option value="mercosul">Mercosul</option>
                    <option value="country">País</option>
                    <option value="state">Estado (BR)</option>
                    <option value="city">Cidade (BR)</option>
                  </select>
                </div>
                {form.target_type !== 'global' && form.target_type !== 'mercosul' && form.target_type !== 'city' && (
                  <div className="adm-field">
                    <label>Local Alvo ({form.target_type})</label>
                    <input type="text" className="adm-input" value={form.target_location} onChange={e => setForm({ ...form, target_location: e.target.value })} placeholder={`Ex: ${form.target_type === 'country' ? 'Brasil' : form.target_type === 'state' ? 'SP' : 'São Paulo'}`} />
                  </div>
                )}
                {form.target_type === 'city' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className="adm-field" style={{ flex: 2 }}>
                      <label>Cidade</label>
                      <input type="text" className="adm-input" value={form.target_location.split('-')[0] || ''} onChange={e => setForm({ ...form, target_location: `${e.target.value}-${form.target_location.split('-')[1] || ''}` })} placeholder="Ex: São Paulo" />
                    </div>
                    <div className="adm-field" style={{ flex: 1 }}>
                      <label>UF</label>
                      <input type="text" className="adm-input" maxLength={2} value={form.target_location.split('-')[1] || ''} onChange={e => setForm({ ...form, target_location: `${form.target_location.split('-')[0] || ''}-${e.target.value.toUpperCase()}` })} placeholder="SP" />
                    </div>
                  </div>
                )}
              </div>

              <div className="adm-field" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
                <label>Arte do Banner (Upload ou URL)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" className="adm-input" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." style={{ flex: 1 }} />
                  <label style={{ 
                    cursor: uploadingImage ? 'not-allowed' : 'pointer', 
                    background: 'var(--adm-surface-2)', 
                    border: '1px solid var(--adm-border)', 
                    borderRadius: '8px', 
                    padding: '0 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    fontWeight: 600, 
                    fontSize: '0.9rem',
                    opacity: uploadingImage ? 0.6 : 1,
                    whiteSpace: 'nowrap'
                  }}>
                    {uploadingImage ? '⏳ Enviando...' : '📁 Escolher Arquivo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <label>Link de Destino (Opcional)</label>
                <input type="text" className="adm-input" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." />
              </div>

              {form.image_url && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Preview da Imagem:</label>
                  <div style={{ width: '100%', height: '100px', backgroundImage: `url(${form.image_url})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', borderRadius: '4px', border: '1px solid var(--adm-border)', marginTop: '4px' }}></div>
                </div>
              )}
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Banner</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
