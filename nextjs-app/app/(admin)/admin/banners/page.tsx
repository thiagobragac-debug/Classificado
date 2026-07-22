'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminBanners() {
  const [banners, setBanners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
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
    const { data, error } = await supabase.from('banners').select('*').order('created_at', { ascending: false })
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

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este banner?')) return
    const supabase = getSupabase()
    const { error } = await supabase.from('banners').delete().eq('id', id)
    if (!error) {
      setBanners(banners.filter(b => b.id !== id))
    } else {
      alert('Erro ao excluir: ' + error.message)
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
    if (!form.name || !form.image_url) return alert('Preencha o nome e a URL da imagem')
    
    const supabase = getSupabase()
    const payload = {
      ...form
    }

    if (editingId) {
      const { error } = await supabase.from('banners').update(payload).eq('id', editingId)
      if (!error) {
        setBanners(banners.map(b => b.id === editingId ? { ...b, ...payload } : b))
        setIsModalOpen(false)
        alert('Banner atualizado!')
      } else {
        alert('Erro: ' + error.message)
      }
    } else {
      const { data, error } = await supabase.from('banners').insert(payload).select().single()
      if (!error && data) {
        setBanners([data, ...banners])
        setIsModalOpen(false)
        alert('Banner criado!')
      } else {
        alert('Erro: ' + error?.message)
      }
    }
  }

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
              ) : banners.map(b => (
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
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%' }}>
            <h3 className="adm-modal-title">{editingId ? '✏️ Editar Banner' : '➕ Novo Banner'}</h3>
            
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
              {form.target_type !== 'global' && form.target_type !== 'mercosul' && (
                <div className="adm-field">
                  <label>Local Alvo ({form.target_type})</label>
                  <input type="text" className="adm-input" value={form.target_location} onChange={e => setForm({ ...form, target_location: e.target.value })} placeholder={`Ex: ${form.target_type === 'country' ? 'Brasil' : form.target_type === 'state' ? 'SP' : 'São Paulo'}`} />
                </div>
              )}
            </div>

            <div className="adm-field" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
              <label>URL da Imagem</label>
              <input type="text" className="adm-input" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
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

            <div className="adm-modal-footer" style={{ marginTop: '24px' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Banner</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
