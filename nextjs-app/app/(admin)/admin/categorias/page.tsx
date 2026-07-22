'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminCategorias() {
  const [categories, setCategories] = useState<any[]>([])
  const [adsCount, setAdsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ id: '', name_pt: '', name_es: '', icon: '🐐', color: '#16A34A', active: true })

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    setLoading(true)
    const supabase = getSupabase()
    
    // Load Categories
    const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true })
    if (!error && data) {
      setCategories(data)
    }

    // Load Ads Count for Stats
    const { count } = await supabase.from('ads').select('*', { count: 'exact', head: true })
    if (count) setAdsCount(count)
    
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name_pt || !form.icon) return alert('Preencha nome e ícone')
    
    const supabase = getSupabase()
    
    // Auto-generate ID if it's new
    const finalId = form.id || form.name_pt.toLowerCase().replace(/[^a-z0-9]/g, '-')
    
    if (editingId) {
      // Update
      const { error } = await supabase.from('categories').update({
        name_pt: form.name_pt,
        name_es: form.name_es,
        icon: form.icon,
        color: form.color,
        active: form.active
      }).eq('id', editingId)

      if (!error) {
        setCategories(categories.map(c => c.id === editingId ? { ...c, ...form } : c))
        setIsModalOpen(false)
        alert('Categoria atualizada!')
      } else {
        alert('Erro: ' + error.message)
      }
    } else {
      // Insert
      const newCat = { ...form, id: finalId, sort_order: categories.length + 1 }
      const { error } = await supabase.from('categories').insert(newCat)

      if (!error) {
        setCategories([...categories, newCat])
        setIsModalOpen(false)
        alert('Categoria criada!')
      } else {
        alert('Erro: ' + error.message)
      }
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('categories').update({ active: !currentActive }).eq('id', id)
    if (!error) {
      setCategories(categories.map(c => c.id === id ? { ...c, active: !currentActive } : c))
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({ id: '', name_pt: '', name_es: '', icon: '🐐', color: '#16A34A', active: true })
    setIsModalOpen(true)
  }

  const openEdit = (c: any) => {
    setEditingId(c.id)
    setForm({ id: c.id, name_pt: c.name_pt, name_es: c.name_es || '', icon: c.icon, color: c.color || '#16A34A', active: c.active })
    setIsModalOpen(true)
  }

  const total = categories.length
  const ativas = categories.filter(c => c.active).length
  const inativas = total - ativas

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gerenciar Categorias</h1>
          <p className="adm-page-sub">Ative, edite ou crie categorias do portal.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="adm-btn adm-btn--primary" onClick={openNew}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Categoria
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '24px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total Categorias</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{ativas}</div><div className="adm-stat-lbl">Ativas</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{inativas}</div><div className="adm-stat-lbl">Desativadas</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{adsCount}</div><div className="adm-stat-lbl">Total Anúncios</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {loading ? (
          <div>Carregando...</div>
        ) : categories.map(c => (
          <div key={c.id} className="adm-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', opacity: c.active ? 1 : 0.6 }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: c.color + '20', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              {c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--adm-text)' }}>{c.name_pt}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
                {c.active ? <span style={{ color: 'var(--adm-green)' }}>Ativa</span> : <span style={{ color: 'var(--adm-red)' }}>Desativada</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={() => openEdit(c)}>Editar</button>
              <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={() => handleToggleActive(c.id, c.active)}>
                {c.active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ width: '400px' }}>
            <h3 className="adm-modal-title">{editingId ? '✏️ Editar Categoria' : '➕ Nova Categoria'}</h3>
            <div className="adm-field">
              <label>Nome (Português)</label>
              <input type="text" className="adm-input" value={form.name_pt} onChange={e => setForm({ ...form, name_pt: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Nome (Espanhol)</label>
              <input type="text" className="adm-input" value={form.name_es} onChange={e => setForm({ ...form, name_es: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="adm-field">
                <label>Ícone (Emoji)</label>
                <input type="text" className="adm-input" maxLength={2} style={{ fontSize: '1.2rem', textAlign: 'center' }} value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />
              </div>
              <div className="adm-field">
                <label>Cor Principal</label>
                <input type="color" className="adm-input" style={{ padding: '4px 8px', height: '38px', cursor: 'pointer', width: '100%' }} value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
              </div>
            </div>
            <div className="adm-modal-footer">
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Categoria</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
