'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminPlanos() {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    icon: '🚀',
    description: '',
    price: 0,
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
    const { data, error } = await supabase.from('plans').select('*').order('sort_order', { ascending: true })
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
      name: '', icon: '🚀', description: '', price: 0, is_active: true, max_ads: 15, max_photos: 15, highlight_count: 2, features: ['']
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
    if (!form.name) return alert('Preencha o nome do plano')
    
    const supabase = getSupabase()
    const payload = {
      ...form,
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
        alert('Plano atualizado!')
      } else {
        alert('Erro: ' + error.message)
      }
    } else {
      const { data, error } = await supabase.from('plans').insert({ ...payload, sort_order: plans.length + 1 }).select().single()
      if (!error && data) {
        setPlans([...plans, data])
        setIsModalOpen(false)
        alert('Plano criado!')
      } else {
        alert('Erro: ' + error?.message)
      }
    }
  }

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
              ) : plans.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{p.icon}</span> {p.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>{p.description}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>R$ {Number(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--adm-text-muted)' }}>/mês</span></td>
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
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="adm-modal-title">{editingId ? '✏️ Editar Plano' : '➕ Novo Plano'}</h3>
            
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="adm-field">
                <label>Preço (Mensal R$)</label>
                <input type="number" step="0.01" className="adm-input" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} placeholder="79.00" />
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

            <div className="adm-modal-footer" style={{ marginTop: '24px' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Plano</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
