'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminPlanos() {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 1.500 planos de uma vez e paginava
  // em memória. Agora a paginação roda de verdade no servidor via .range(),
  // e os KPIs (total/ativos/inativos/preço médio) vêm de uma contagem
  // global separada, não do array já paginado.
  const [totalPlans, setTotalPlans] = useState(0)
  const [counts, setCounts] = useState({ ativos: 0, inativos: 0, mediaPreco: 'R$ 0,00' })

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
    // GAP CORRIGIDO (validação de 2026-08-26): has_video/has_banner são
    // aplicados de verdade no banco desde 25/08
    // (enforce_ad_media_plan_limits/enforce_profile_banner_plan_limit) e
    // vendidos publicamente em /planos — não havia como o admin mudar
    // isso pela UI, só via SQL direto.
    has_video: false,
    has_banner: false,
    features: ['']
  })

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadPlans()
  }, [currentPage])

  async function loadPlans() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    const { data, count, error } = await supabase.from('plans').select('*', { count: 'exact' }).order('sort_order', { ascending: true }).range(from, to)
    if (!error && data) {
      setPlans(data)
      if (count !== null) setTotalPlans(count)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhum plano
      // encontrado" sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar planos: ' + error.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    // Tabela pequena e curada por admin (nunca vai ter milhares de linhas)
    // — busca só as 2 colunas necessárias pro cálculo, sem trazer o resto.
    const { data, error } = await supabase.from('plans').select('is_active, price').limit(5000)
    if (error) return showToast('Erro ao carregar contadores: ' + error.message, 'error')
    const rows: { is_active: boolean; price: number | string | null }[] = data || []
    const ativos = rows.filter((p: any) => p.is_active).length
    const mediaPreco = rows.length > 0
      ? (rows.reduce((acc: number, p: any) => acc + Number(p.price || 0), 0) / rows.length).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'R$ 0,00'
    setCounts({ ativos, inativos: rows.length - ativos, mediaPreco })
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('plans').update({ is_active: !currentActive }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setPlans(plans.map(p => p.id === id ? { ...p, is_active: !currentActive } : p))
      loadCounts()
    } else if (!error) {
      showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({
      name: '', icon: '🚀', description: '', price: 0, promotional_price: '', is_active: true, max_ads: 15, max_photos: 15, highlight_count: 2, has_video: false, has_banner: false, features: ['']
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
      has_video: !!p.has_video,
      has_banner: !!p.has_banner,
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
    if (!isFinite(form.price) || form.price < 0) return showToast('Preço padrão inválido', 'error')

    const promoValue = form.promotional_price === '' ? null : Number(form.promotional_price)
    // BUG CORRIGIDO: sem esta checagem, um preço promocional maior que o
    // preço cheio salvava normalmente e exibia "de R$ X por R$ Y" com Y > X
    // tanto na tabela do admin quanto em /planos (público).
    if (promoValue !== null && (!isFinite(promoValue) || promoValue < 0)) return showToast('Preço promocional inválido', 'error')
    if (promoValue !== null && promoValue >= form.price) return showToast('O preço promocional deve ser menor que o preço padrão', 'error')

    const supabase = getSupabase()
    const payload = {
      ...form,
      promotional_price: promoValue,
      currency: 'BRL',
      interval: 'month',
      features: form.features.filter(f => f.trim() !== ''),
      updated_at: new Date().toISOString()
    }

    if (editingId) {
      const { data, error } = await supabase.from('plans').update(payload).eq('id', editingId).select()
      if (!error && data && data.length > 0) {
        setPlans(plans.map(p => p.id === editingId ? { ...p, ...payload } : p))
        setIsModalOpen(false)
        showToast('Plano atualizado!', 'success')
        loadCounts()
      } else if (!error) {
        showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      // BUG CORRIGIDO: `plans.length` agora é só o tamanho da PÁGINA atual
      // (paginação real), não o total — usava isso pra calcular o próximo
      // sort_order.
      const { data, error } = await supabase.from('plans').insert({ ...payload, sort_order: totalPlans + 1 }).select().single()
      if (!error && data) {
        setIsModalOpen(false)
        showToast('Plano criado!', 'success')
        // Um plano novo entra no fim da ordenação — pode cair numa página
        // diferente da atual, então recarrega de verdade.
        loadPlans()
        loadCounts()
      } else {
        showToast('Erro: ' + error?.message, 'error')
      }
    }
  }

  // KPIs: globais, vindos de loadCounts() — não dependem da página atual
  const { ativos, inativos, mediaPreco } = counts
  const total = totalPlans

  const totalPages = Math.ceil(totalPlans / pageSize)

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
              ) : plans.map(p => (
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalPlans === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalPlans)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalPlans}</strong> itens
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
                  <input type="number" step="0.01" className="adm-input" value={form.price} onChange={e => { const n = parseFloat(e.target.value); setForm({ ...form, price: isNaN(n) ? 0 : n }) }} placeholder="79.00" />
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
                  <input type="number" className="adm-input" value={form.max_ads} onChange={e => { const n = parseInt(e.target.value); setForm({ ...form, max_ads: isNaN(n) ? 0 : n }) }} />
                </div>
                <div className="adm-field">
                  <label>Fotos/Anúncio</label>
                  <input type="number" className="adm-input" value={form.max_photos} onChange={e => { const n = parseInt(e.target.value); setForm({ ...form, max_photos: isNaN(n) ? 0 : n }) }} />
                </div>
                <div className="adm-field">
                  <label>Destaques Home</label>
                  <input type="number" className="adm-input" value={form.highlight_count} onChange={e => { const n = parseInt(e.target.value); setForm({ ...form, highlight_count: isNaN(n) ? 0 : n }) }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_video} onChange={e => setForm({ ...form, has_video: e.target.checked })} />
                  Vídeo no anúncio
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_banner} onChange={e => setForm({ ...form, has_banner: e.target.checked })} />
                  Banner de perfil
                </label>
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
