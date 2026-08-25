'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminCategorias() {
  const { confirm } = useConfirm()
  const [categories, setCategories] = useState<any[]>([])
  const [adsCount, setAdsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

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
    const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true }).limit(1500)
    if (!error && data) {
      setCategories(data)
    }

    // Load Ads Count for Stats
    const { count } = await supabase.from('ads').select('*', { count: 'exact', head: true })
    if (count) setAdsCount(count)
    
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name_pt || !form.icon) return showToast('Preencha nome e ícone', 'error')
    
    const supabase = getSupabase()
    
    // Auto-generate ID if it's new
    // BUG CORRIGIDO (reteste do site, 2026-08-25): substituir CADA caractere
    // não-alfanumérico por um hífen (em vez de uma SEQUÊNCIA deles por um
    // hífen só) produzia ids com hífen duplo/solto pra nomes com pontuação
    // consecutiva (ex.: "[TESTE E2E] Categoria" -> "-teste-e2e--categoria").
    const finalId = form.id || form.name_pt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    
    if (editingId) {
      // Update
      const { data, error } = await supabase.from('categories').update({
        name_pt: form.name_pt,
        name_es: form.name_es,
        icon: form.icon,
        color: form.color,
        active: form.active
      }).eq('id', editingId).select()

      // GAP CORRIGIDO (reteste do site, 2026-08-25): update().eq() sem
      // .select() retorna { error: null } mesmo quando o filtro não bate
      // com nenhuma linha (ex.: RLS bloqueando silenciosamente) — a UI
      // mostrava "Categoria atualizada!" sem ter mudado nada no banco.
      if (!error && data && data.length > 0) {
        setCategories(categories.map(c => c.id === editingId ? { ...c, ...form } : c))
        setIsModalOpen(false)
        showToast('Categoria atualizada!', 'success')
      } else if (!error) {
        showToast('Nenhuma categoria foi alterada — verifique suas permissões.', 'error')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      // Insert
      const newCat = { ...form, id: finalId, sort_order: categories.length + 1 }
      const { error } = await supabase.from('categories').insert(newCat)

      if (!error) {
        setCategories([...categories, newCat])
        setIsModalOpen(false)
        showToast('Categoria criada!', 'success')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('categories').update({ active: !currentActive }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setCategories(categories.map(c => c.id === id ? { ...c, active: !currentActive } : c))
    } else if (!error) {
      showToast('Nenhuma categoria foi alterada — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  // GAP CORRIGIDO (auditoria completa, 2026-08-25): não havia forma de
  // excluir uma categoria pela UI (só editar/ativar-desativar), diferente
  // de Banners e Páginas Institucionais, que já tinham "Excluir" na
  // listagem. A FK de ads.category_id é ON DELETE NO ACTION (confirmado no
  // banco), então o Postgres já protege sozinho contra excluir uma
  // categoria com anúncios associados — só precisa tratar esse erro (código
  // 23503) com uma mensagem amigável em vez de deixar a exceção crua.
  const handleDelete = async (c: any) => {
    if (!(await confirm(`Deseja realmente excluir a categoria "${c.name_pt}"?`))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('categories').delete().eq('id', c.id).select()
    if (!error && data && data.length > 0) {
      setCategories(categories.filter(cat => cat.id !== c.id))
      showToast('Categoria excluída!', 'success')
    } else if (error?.code === '23503') {
      showToast('Não é possível excluir: existem anúncios cadastrados nesta categoria.', 'error')
    } else if (!error) {
      showToast('Nenhuma categoria foi excluída — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
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

  const totalPages = Math.ceil(categories.length / pageSize)
  const paginatedCategories = categories.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
        ) : paginatedCategories.map(c => (
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
              <button className="adm-btn adm-btn--outline adm-btn--sm" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(c)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
      {/* PAGINATION FOOTER */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
          <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
            Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{categories.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, categories.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{categories.length}</strong> itens
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

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* 1. FIXED HEADER */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
            </div>

            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
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
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Categoria</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
