'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminDepoimentos() {
  const [testimonials, setTestimonials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  // Form State
  const [text, setText] = useState('')
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
    }
    setLoading(false)
  }

  const handleOpenModal = (testi?: any) => {
    if (testi) {
      setEditingId(testi.id)
      setText(testi.text)
      setAuthor(testi.author)
      setLoc(testi.loc || '')
      setRating(testi.rating || 5)
    } else {
      setEditingId(null)
      setText('')
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
      alert('Texto e Autor são obrigatórios.')
      return
    }

    const supabase = getSupabase()
    const payload = {
      text,
      author,
      loc,
      rating
    }

    if (editingId) {
      const { error } = await supabase.from('testimonials').update(payload).eq('id', editingId)
      if (error) alert('Erro ao atualizar: ' + error.message)
      else {
        alert('Atualizado com sucesso!')
        loadTestimonials()
        handleCloseModal()
      }
    } else {
      const { error } = await supabase.from('testimonials').insert([payload])
      if (error) alert('Erro ao criar: ' + error.message)
      else {
        alert('Criado com sucesso!')
        loadTestimonials()
        handleCloseModal()
      }
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente apagar este depoimento?')) return
    const supabase = getSupabase()
    const { error } = await supabase.from('testimonials').delete().eq('id', id)
    if (error) alert('Erro ao deletar: ' + error.message)
    else {
      setTestimonials(testimonials.filter(t => t.id !== id))
    }
  }

  return (
    <div className="adm-content fade-in">
      <div className="adm-header">
        <div>
          <h1 className="adm-h1">Depoimentos</h1>
          <p className="adm-p">Gerencie os depoimentos que aparecem na Home.</p>
        </div>
        <button className="adm-btn adm-btn-primary" onClick={() => handleOpenModal()}>
          + Novo Depoimento
        </button>
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
                {testimonials.map(t => (
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
                      <button className="adm-btn adm-btn-secondary" style={{ marginRight: '8px' }} onClick={() => handleOpenModal(t)}>Editar</button>
                      <button className="adm-btn adm-btn-danger" onClick={() => handleDelete(t.id)}>Apagar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="adm-modal-overlay" onClick={handleCloseModal}>
          <div className="adm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 className="adm-h2" style={{ marginBottom: '1.5rem' }}>{editingId ? 'Editar Depoimento' : 'Novo Depoimento'}</h2>
            
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
              <input type="number" min="1" max="5" className="adm-input" value={rating} onChange={e => setRating(parseInt(e.target.value))} />
            </div>

            <div className="adm-form-group">
              <label className="adm-label">Texto do Depoimento *</label>
              <textarea className="adm-input" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="O que o cliente disse..." />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button className="adm-btn adm-btn-secondary" onClick={handleCloseModal}>Cancelar</button>
              <button className="adm-btn adm-btn-primary" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
