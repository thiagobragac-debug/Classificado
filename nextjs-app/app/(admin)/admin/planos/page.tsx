'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminPlanos() {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    icon: '🚀',
    description: '',
    price: 0,
    promotional_price: '' as number | string,
    is_active: true,
    max_ads: 15,
    max_photos: 15,
    highlight_count: 2,
    features: ['']
  })

  useEffect(() => {
    loadPlans()
  }, [])

  async function loadPlans() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase.from('plans').select('*').order('sort_order', { ascending: true }).limit(1500)
    if (!error && data) {
      setPlans(data)
    }
    setLoading(false)
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('plans').update({ is_active: !currentActive }).eq('id', id)
    if (!error) {
      setPlans(plans.map(p => p.id === id ? { ...p, is_active: !currentActive } : p))
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({
      name: '', icon: '🚀', description: '', price: 0, promotional_price: '', is_active: true, max_ads: 15, max_photos: 15, highlight_count: 2, features: ['']
    })
    setIsModalOpen(true)
  }

  const openEdit = (p: any) => {
    setEditingId(p.id)
    setForm({
      name: p.name || '',
      icon: p.icon || '🚀',
      description: p.description || '',
      price: p.price || 0,
      promotional_price: p.promotional_price || '',
      is_active: p.is_active,
      max_ads: p.max_ads || 0,
      max_photos: p.max_photos || 0,
      highlight_count: p.highlight_count || 0,
      features: Array.isArray(p.features) ? p.features : p.features ? [p.features] : ['']
    })
    setIsModalOpen(true)
  }

  const handleFeatureChange = (index: number, val: string) => {
    const newFeatures = [...form.features]
    newFeatures[index] = val
    setForm({ ...form, features: newFeatures })
  }

  const addFeature = () => {
    setForm({ ...form, features: [...form.features, ''] })
  }

  const removeFeature = (index: number) => {
    const newFeatures = form.features.filter((_, i) => i !== index)
    setForm({ ...form, features: newFeatures })
  }

  const handleSave = async () => {
    if (!form.name) return showToast('Preencha o nome do plano', 'error')
    
    const supabase = getSupabase()
    const payload = {
      ...form,
      promotional_price: form.promotional_price === '' ? null : Number(form.promotional_price),
      currency: 'BRL',
      interval: 'month',
      features: form.features.filter(f => f.trim() !== ''),
      updated_at: new Date().toISOString()
    }

    if (editingId) {
      const { error } = await supabase.from('plans').update(payload).eq('id', editingId)
      if (!error) {
        setPlans(plans.map(p => p.id === editingId ? { ...p, ...payload } : p))
        setIsModalOpen(false)
        showToast('Plano atualizado!', 'success')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      const { data, error } = await supabase.from('plans').insert({ ...payload, sort_order: plans.length + 1 }).select().single()
      if (!error && data) {
        setPlans([...plans, data])
        setIsModalOpen(false)
        showToast('Plano criado!', 'success')
      } else {
        showToast('Erro: ' + error?.message, 'error')
      }
    }
  }

  // KPIs
  const total = plans.length
  const ativos = plans.filter(p => p.is_active).length
  const inativos = plans.filter(p => !p.is_active).length
  const mediaPreco = total > 0 ? (plans.reduce((acc, p) => acc + Number(p.price || 0), 0) / total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'

  const totalPages = Math.ceil(plans.length / pageSize)
  const paginatedPlans = plans.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gerenciar Planos</h1>
          <p className="adm-page-sub">Crie e edite os planos de assinatura disponíveis para os usuários.</p>
        </div>
        <button className="adm-btn adm-btn--primary" onClick={openNew}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Plano
        </button>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Planos</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativos</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{inativos}</div><div className="adm-stat-lbl">Inativos</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{mediaPreco}</div><div className="adm-stat-lbl">Preço Médio</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th>Plano</th>
                <th>Preço</th>
                <th>Limites</th>
                <th>Destaques</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Carregando planos...</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Nenhum plano encontrado.</td></tr>
              ) : paginatedPlans.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{p.icon}</span> {p.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>{p.description}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {p.promotional_price > 0 ? (
                      <div>
                        <span style={{ textDecoration: 'line-through', color: 'var(--adm-text-muted)', fontSize: '0.8rem', marginRight: '6px' }}>R$ {Number(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span style={{ color: 'var(--adm-green)' }}>R$ {Number(p.promotional_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--adm-text-muted)' }}>/mês</span>
                      </div>
                    ) : (
                      <>R$ {Number(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--adm-text-muted)' }}>/mês</span></>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    <div style={{ color: 'var(--adm-text-muted)' }}><strong style={{ color: 'var(--adm-text)' }}>{p.max_ads}</strong> anúncios</div>
                    <div style={{ color: 'var(--adm-text-muted)' }}><strong style={{ color: 'var(--adm-text)' }}>{p.max_photos}</strong> fotos</div>
                  </td>
                  <td><span className="adm-badge adm-badge--featured">{p.highlight_count} destaques</span></td>
                  <td>
                    {p.is_active ? <span className="adm-badge adm-badge--green">Ativo</span> : <span className="adm-badge adm-badge--amber">Inativo</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(p)}>Editar</button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleToggleActive(p.id, p.is_active)}>
                        {p.is_active ? 'Desativar' : 'Ativar'}
                      </button>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, plans.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{plans.length}</strong> itens
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
                {editingId ? 'Editar Plano' : 'Novo Plano'}
              </h3>
            </div>
            
            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Nome do Plano</label>
                  <input type="text" className="adm-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Produtor PRO" />
                </div>
                <div className="adm-field">
                  <label>Ícone (Emoji)</label>
                  <input type="text" className="adm-input" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🚀" />
                </div>
              </div>

              <div className="adm-field">
                <label>Descrição Curta</label>
                <input type="text" className="adm-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Breve descrição..." />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Preço Padrão (R$)</label>
                  <input type="number" step="0.01" className="adm-input" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} placeholder="79.00" />
                </div>
                <div className="adm-field">
                  <label>Preço Promo (Opcional)</label>
                  <input type="number" step="0.01" className="adm-input" value={form.promotional_price} onChange={e => setForm({ ...form, promotional_price: e.target.value })} placeholder="Ex: 59.00" />
                </div>
                <div className="adm-field">
                  <label>Status</label>
                  <select className="adm-select" value={form.is_active.toString()} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              </div>

              <h4 style={{ margin: '20px 0 10px', fontSize: '1rem', color: 'var(--adm-text)' }}>Limites</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Max Anúncios</label>
                  <input type="number" className="adm-input" value={form.max_ads} onChange={e => setForm({ ...form, max_ads: parseInt(e.target.value) })} />
                </div>
                <div className="adm-field">
                  <label>Fotos/Anúncio</label>
                  <input type="number" className="adm-input" value={form.max_photos} onChange={e => setForm({ ...form, max_photos: parseInt(e.target.value) })} />
                </div>
                <div className="adm-field">
                  <label>Destaques Home</label>
                  <input type="number" className="adm-input" value={form.highlight_count} onChange={e => setForm({ ...form, highlight_count: parseInt(e.target.value) })} />
                </div>
              </div>

              <h4 style={{ margin: '20px 0 10px', fontSize: '1rem', color: 'var(--adm-text)' }}>Regras (Features)</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginBottom: '12px' }}>Adicione as regras textuais que aparecem na tela (Ex: Suporte WhatsApp, Selo Verificado).</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {form.features.map((feat, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="adm-input" value={feat} onChange={e => handleFeatureChange(i, e.target.value)} placeholder={`Feature ${i + 1}`} style={{ flex: 1 }} />
                    {form.features.length > 1 && (
                      <button type="button" className="adm-btn adm-btn--outline" style={{ padding: '0 12px', color: 'var(--adm-red)' }} onClick={() => removeFeature(i)}>X</button>
                    )}
                  </div>
                ))}
              </div>
              
              <button className="adm-btn adm-btn--outline" style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }} onClick={addFeature}>+ Adicionar Regra</button>
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Plano</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
