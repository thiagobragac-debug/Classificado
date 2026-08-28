'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminDepoimentos() {
  const { confirm } = useConfirm()
  const [testimonials, setTestimonials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  // Form State
  const [text, setText] = useState('')
  const [textEs, setTextEs] = useState('')
  const [author, setAuthor] = useState('')
  const [loc, setLoc] = useState('')
  const [rating, setRating] = useState(5)

  useEffect(() => {
    loadTestimonials()
  }, [])

  async function loadTestimonials() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTestimonials(data)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhum depoimento
      // cadastrado" sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar depoimentos: ' + error.message, 'error')
    }
    setLoading(false)
  }

  const handleOpenModal = (testi?: any) => {
    if (testi) {
      setEditingId(testi.id)
      setText(testi.text)
      setTextEs(testi.text_es || '')
      setAuthor(testi.author)
      setLoc(testi.loc || '')
      setRating(testi.rating || 5)
    } else {
      setEditingId(null)
      setText('')
      setTextEs('')
      setAuthor('')
      setLoc('')
      setRating(5)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
  }

  const handleSave = async () => {
    if (!text || !author) {
      // BUG CORRIGIDO: toast de erro de validação usava o tipo 'success'
      // (aparecia verde, como se tivesse dado certo).
      showToast('Texto e Autor são obrigatórios.', 'error')
      return
    }

    const supabase = getSupabase()
    const payload = {
      text,
      text_es: textEs || null,
      author,
      loc,
      rating
    }

    if (editingId) {
      // GAP CORRIGIDO (reteste do site, 2026-08-25): update().eq() sem
      // .select() retorna { error: null } mesmo sem alterar nenhuma linha
      // (ex.: RLS bloqueando silenciosamente) — a UI mostrava sucesso sem
      // ter gravado nada no banco.
      const { data, error } = await supabase.from('testimonials').update(payload).eq('id', editingId).select()
      if (error) showToast('Erro ao atualizar: ' + error.message, 'error')
      else if (!data || data.length === 0) showToast('Nenhum depoimento foi alterado — verifique suas permissões.', 'error')
      else {
        showToast('Atualizado com sucesso!', 'success')
        loadTestimonials()
        handleCloseModal()
      }
    } else {
      const { error } = await supabase.from('testimonials').insert([payload])
      if (error) showToast('Erro ao criar: ' + error.message, 'error')
      else {
        showToast('Criado com sucesso!', 'success')
        loadTestimonials()
        handleCloseModal()
      }
    }
  }

  const handleDelete = async (id: number) => {
    if (!(await confirm('Deseja realmente apagar este depoimento?'))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('testimonials').delete().eq('id', id).select()
    if (error) showToast('Erro ao deletar: ' + error.message, 'error')
    else if (!data || data.length === 0) showToast('Nenhum depoimento foi excluído — verifique suas permissões.', 'error')
    else {
      setTestimonials(testimonials.filter(t => t.id !== id))
    }
  }

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Depoimentos</h1>
          <p className="adm-page-sub">Gerencie os depoimentos que aparecem na Home.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="adm-btn adm-btn--primary" onClick={() => handleOpenModal()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Depoimento
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{testimonials.length}</div><div className="adm-stat-lbl">Total</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{testimonials.filter(t => (t.rating || 5) === 5).length}</div><div className="adm-stat-lbl">5 Estrelas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-blue)' }}>{testimonials.filter(t => (t.rating || 5) === 4).length}</div><div className="adm-stat-lbl">4 Estrelas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{testimonials.filter(t => (t.rating || 5) < 4).length}</div><div className="adm-stat-lbl">Menor que 4</div></div>
        </div>
      </div>

      <div className="adm-card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando depoimentos...</div>
        ) : testimonials.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Nenhum depoimento cadastrado.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Autor</th>
                  <th>Localização</th>
                  <th>Texto</th>
                  <th>Nota</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {testimonials.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(t => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td style={{ fontWeight: 600 }}>{t.author}</td>
                    <td>{t.loc || '-'}</td>
                    <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.text}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '2px', color: '#eab308' }}>
                        {Array.from({ length: t.rating || 5 }).map((_, i) => (
                          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="adm-btn adm-btn--outline" style={{ marginRight: '8px' }} onClick={() => handleOpenModal(t)}>Editar</button>
                      <button className="adm-btn adm-btn--danger" onClick={() => handleDelete(t.id)}>Apagar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Paginação */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
                <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
                  Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{testimonials.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * itemsPerPage, testimonials.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{testimonials.length}</strong> itens
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="adm-btn adm-btn--outline adm-btn--sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </button>
                  
                  {Array.from({ length: Math.ceil(testimonials.length / itemsPerPage) || 1 }).map((_, i) => {
                    const totalPages = Math.ceil(testimonials.length / itemsPerPage) || 1
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
                    disabled={currentPage === (Math.ceil(testimonials.length / itemsPerPage) || 1)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(testimonials.length / itemsPerPage) || 1, prev + 1))}
                  >
                    Próxima
                  </button>
                </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="adm-modal-overlay" onClick={handleCloseModal}>
          <div className="adm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* 1. FIXED HEADER */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Depoimento' : 'Novo Depoimento'}
              </h3>
            </div>
            
            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div className="adm-form-group">
                <label className="adm-label">Autor *</label>
                <input type="text" className="adm-input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Ex: João Batista" />
              </div>

              <div className="adm-form-group">
                <label className="adm-label">Localização</label>
                <input type="text" className="adm-input" value={loc} onChange={e => setLoc(e.target.value)} placeholder="Ex: Sorriso, MT" />
              </div>

              <div className="adm-form-group">
                <label className="adm-label">Nota (1 a 5)</label>
                <input type="number" min="1" max="5" className="adm-input" value={rating} onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n)) setRating(n) }} />
              </div>

              <div className="adm-form-group">
                <label className="adm-label">Texto do Depoimento *</label>
                <textarea className="adm-input" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="O que o cliente disse..." />
              </div>

              <div className="adm-form-group">
                {/* GAP CORRIGIDO: TestimonialsSection.tsx já lê text_es (com
                    fallback para text), mas não havia como o admin cadastrar
                    essa tradução — o formulário não tinha o campo. */}
                <label className="adm-label">Texto em Espanhol (Opcional)</label>
                <textarea className="adm-input" rows={4} value={textEs} onChange={e => setTextEs(e.target.value)} placeholder="Traducción al español (opcional)..." />
              </div>
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="adm-btn adm-btn--outline" onClick={handleCloseModal}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
