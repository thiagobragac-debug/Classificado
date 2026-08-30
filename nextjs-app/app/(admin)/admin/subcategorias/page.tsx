'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminSubcategorias() {
  const { confirm } = useConfirm()
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [allCategories, setAllCategories] = useState<any[]>([])
  const [adsCount, setAdsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  const [totalSubcategories, setTotalSubcategories] = useState(0)
  const [counts, setCounts] = useState({ ativas: 0, inativas: 0 })

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ id: '', category_id: '', name_pt: '', name_es: '', active: true })

  useEffect(() => {
    loadCategories()
    loadCounts()
  }, [])

  useEffect(() => {
    loadSubcategories()
  }, [currentPage])

  async function loadCategories() {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('categories').select('id, name_pt, name_es').eq('active', true).order('sort_order', { ascending: true })
    if (!error && data) setAllCategories(data)
  }

  async function loadSubcategories() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1

    const { data, count, error } = await supabase.from('subcategories').select('*, categories(name_pt, name_es)', { count: 'exact' }).order('sort_order', { ascending: true }).range(from, to)
    if (!error && data) {
      setSubcategories(data)
      if (count !== null) setTotalSubcategories(count)
    } else if (error) {
      showToast('Erro ao carregar subcategorias: ' + error.message, 'error')
    }

    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const [adsRes, ativasRes, inativasRes] = await Promise.all([
      supabase.from('ads').select('*', { count: 'exact', head: true }).not('subcategory_id', 'is', null),
      supabase.from('subcategories').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('subcategories').select('*', { count: 'exact', head: true }).eq('active', false),
    ])
    const firstError = [adsRes, ativasRes, inativasRes].find(r => r.error)?.error
    if (firstError) showToast('Erro ao carregar contadores: ' + firstError.message, 'error')
    if (adsRes.count) setAdsCount(adsRes.count)
    setCounts({ ativas: ativasRes.count || 0, inativas: inativasRes.count || 0 })
  }

  const handleSave = async () => {
    if (!form.name_pt || !form.category_id) return showToast('Preencha a categoria e o nome', 'error')

    const supabase = getSupabase()

    const finalId = form.id || form.name_pt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (editingId) {
      const { data, error } = await supabase.from('subcategories').update({
        category_id: form.category_id,
        name_pt: form.name_pt,
        name_es: form.name_es,
        active: form.active
      }).eq('id', editingId).select()

      if (!error && data && data.length > 0) {
        setIsModalOpen(false)
        showToast('Subcategoria atualizada!', 'success')
        loadSubcategories()
      } else if (!error) {
        showToast('Nenhuma subcategoria foi alterada — verifique suas permissões.', 'error')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      const newSub = { id: finalId, category_id: form.category_id, name_pt: form.name_pt, name_es: form.name_es, active: form.active, sort_order: totalSubcategories + 1 }
      const { error } = await supabase.from('subcategories').insert(newSub)

      if (!error) {
        setIsModalOpen(false)
        showToast('Subcategoria criada!', 'success')
        loadSubcategories()
        loadCounts()
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()

    if (currentActive) {
      const { count } = await supabase.from('ads').select('*', { count: 'exact', head: true }).eq('subcategory_id', id).eq('status', 'active')
      if (count && count > 0) {
        const ok = await confirm(`Esta subcategoria tem ${count} anúncio${count > 1 ? 's' : ''} ativo${count > 1 ? 's' : ''}. Desativar a subcategoria não remove esses anúncios, mas ela some dos filtros públicos. Continuar?`)
        if (!ok) return
      }
    }

    const { data, error } = await supabase.from('subcategories').update({ active: !currentActive }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setSubcategories(subcategories.map(s => s.id === id ? { ...s, active: !currentActive } : s))
      loadCounts()
    } else if (!error) {
      showToast('Nenhuma subcategoria foi alterada — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const handleDelete = async (s: any) => {
    if (!(await confirm(`Deseja realmente excluir a subcategoria "${s.name_pt}"?`))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('subcategories').delete().eq('id', s.id).select()
    if (!error && data && data.length > 0) {
      showToast('Subcategoria excluída!', 'success')
      // Se a subcategoria excluída era o único item da página atual e não é
      // a primeira página, volta uma página antes de recarregar — senão a
      // tabela fica vazia com dados só em páginas anteriores.
      if (subcategories.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1)
      } else {
        loadSubcategories()
      }
      loadCounts()
    } else if (error?.code === '23503') {
      showToast('Não é possível excluir: existem anúncios cadastrados nesta subcategoria.', 'error')
    } else if (!error) {
      showToast('Nenhuma subcategoria foi excluída — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({ id: '', category_id: allCategories[0]?.id || '', name_pt: '', name_es: '', active: true })
    setIsModalOpen(true)
  }

  const openEdit = (s: any) => {
    setEditingId(s.id)
    setForm({ id: s.id, category_id: s.category_id, name_pt: s.name_pt, name_es: s.name_es || '', active: s.active })
    setIsModalOpen(true)
  }

  const { ativas, inativas } = counts
  const total = totalSubcategories

  const totalPages = Math.ceil(totalSubcategories / pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gerenciar Subcategorias</h1>
          <p className="adm-page-sub">Ative, edite ou crie subcategorias vinculadas a uma categoria.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="adm-btn adm-btn--primary" onClick={openNew} disabled={allCategories.length === 0}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Subcategoria
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ marginBottom: '24px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total Subcategorias</div></div>
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
          <div><div className="adm-stat-val">{adsCount}</div><div className="adm-stat-lbl">Anúncios com Subcategoria</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
        </div>
      </div>

      {allCategories.length === 0 && !loading && (
        <div className="adm-card" style={{ padding: '16px', marginBottom: '20px', color: 'var(--adm-amber)' }}>
          Nenhuma categoria ativa cadastrada — crie uma categoria antes de cadastrar subcategorias.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {loading ? (
          <div>Carregando...</div>
        ) : subcategories.map(s => (
          <div key={s.id} className="adm-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', opacity: s.active ? 1 : 0.6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--adm-text)' }}>{s.name_pt}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
                {s.categories?.name_pt || s.category_id}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
                {s.active ? <span style={{ color: 'var(--adm-green)' }}>Ativa</span> : <span style={{ color: 'var(--adm-red)' }}>Desativada</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={() => openEdit(s)}>Editar</button>
              <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={() => handleToggleActive(s.id, s.active)}>
                {s.active ? 'Desativar' : 'Ativar'}
              </button>
              <button className="adm-btn adm-btn--outline adm-btn--sm" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(s)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
        <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
          Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalSubcategories === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalSubcategories)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalSubcategories}</strong> itens
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
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Subcategoria' : 'Nova Subcategoria'}
              </h3>
            </div>

            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div className="adm-field">
                <label>Categoria</label>
                <select className="adm-input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  {allCategories.map(c => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
                </select>
              </div>
              <div className="adm-field">
                <label>Nome (Português)</label>
                <input type="text" className="adm-input" value={form.name_pt} onChange={e => setForm({ ...form, name_pt: e.target.value })} />
              </div>
              <div className="adm-field">
                <label>Nome (Espanhol)</label>
                <input type="text" className="adm-input" value={form.name_es} onChange={e => setForm({ ...form, name_es: e.target.value })} />
              </div>
            </div>

            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Subcategoria</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
