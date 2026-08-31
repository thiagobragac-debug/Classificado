'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import RichTextEditor from '@/components/RichTextEditor'

export default function AdminInstitutionalPages() {
  const { confirm } = useConfirm()
  const [pages, setPages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState({
    id: '',
    title: '',
    subtitle: '',
    group_name: '',
    icon_name: '',
    content: '',
    order_idx: 0
  })

  // To know if we are creating or editing
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    loadPages()
  }, [])

  async function loadPages() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase.from('institutional_pages').select('*').order('group_name', { ascending: true }).order('order_idx', { ascending: true })
    if (!error && data) {
      setPages(data)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhuma página
      // encontrada" sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar páginas: ' + error.message, 'error')
    }
    setLoading(false)
  }

  const handleEdit = (page: any) => {
    setForm({
      id: page.id,
      title: page.title || '',
      subtitle: page.subtitle || '',
      group_name: page.group_name || '',
      icon_name: page.icon_name || '',
      content: page.content || '',
      order_idx: page.order_idx || 0
    })
    setIsEditing(true)
    setIsModalOpen(true)
  }

  const handleCreate = () => {
    setForm({
      id: '',
      title: '',
      subtitle: '',
      group_name: 'Nova Categoria',
      icon_name: 'file',
      content: '',
      order_idx: 99
    })
    setIsEditing(false)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    // BUG CORRIGIDO (achado de usabilidade): o confirm() era genérico e
    // idêntico pra qualquer linha — sem o título da página, o admin não
    // tinha como confirmar visualmente que ia excluir a página certa.
    const pagina = pages.find(p => p.id === id)
    const titulo = pagina?.title || 'esta página'
    if (!(await confirm(`Deseja realmente excluir a página "${titulo}"? Essa ação não pode ser desfeita.`))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('institutional_pages').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      setPages(pages.filter(p => p.id !== id))
      showToast('Página excluída com sucesso.', 'success')
    } else if (!error) {
      showToast('Nenhuma página foi excluída — verifique suas permissões.', 'error')
    } else {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.id.trim()) {
      showToast('O ID da página é obrigatório.', 'error')
      return
    }

    // BUG CORRIGIDO: ao CRIAR (não editar), o ID é digitado livremente e o
    // upsert seguinte grava por PK — um ID que já existe (erro de digitação,
    // ex. igual a uma página real) sobrescrevia o conteúdo real em silêncio,
    // sem confirmação (diferente da exclusão, que já pede confirm()).
    if (!isEditing && pages.some(p => p.id === form.id.trim())) {
      showToast(`Já existe uma página com o ID "${form.id.trim()}". Use "Editar" nela em vez de criar uma nova, ou escolha outro ID.`, 'error')
      return
    }

    // GAP CORRIGIDO (defesa em profundidade): a sanitização de HTML só
    // acontecia na leitura pública (app/(public)/institucional/page.tsx),
    // nunca na escrita. Funciona hoje porque esse é o único consumidor e
    // ele sempre sanitiza antes de renderizar — mas um novo consumidor
    // futuro que renderizasse este campo sem os mesmos ALLOWED_TAGS
    // reabriria XSS armazenado. Sanitiza aqui também, com a mesma lista.
    const DOMPurify = (await import('isomorphic-dompurify')).default
    const ALLOWED_TAGS = [
      'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
      'a', 'strong', 'em', 'b', 'i',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'hr', 'br', 'span', 'div', 'section',
      'details', 'summary'
    ]
    // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): 'style' removido —
    // deve ficar em sincronia com a mesma allowlist do lado de leitura em
    // app/(public)/institucional/page.tsx.
    const ALLOWED_ATTR = ['href', 'class', 'target', 'rel', 'id', 'aria-label', 'data-i18n']

    const supabase = getSupabase()
    const payload = {
      ...form,
      content: DOMPurify.sanitize(form.content, { ALLOWED_TAGS, ALLOWED_ATTR, ADD_ATTR: ['target'] }),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('institutional_pages').upsert(payload).select()
    if (error) {
      showToast('Erro ao salvar página: ' + error.message, 'error')
    } else if (!data || data.length === 0) {
      showToast('Nenhuma página foi salva — verifique suas permissões.', 'error')
    } else {
      showToast('Página salva com sucesso!', 'success')
      setIsModalOpen(false)
      loadPages()
    }
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Páginas Institucionais</h1>
          <p className="adm-page-sub">Gerencie as páginas estáticas (Sobre, Termos, Ajuda) disponíveis no rodapé do site.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="adm-btn adm-btn--primary" onClick={handleCreate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nova Página
          </button>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-table-container">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--adm-text-muted)' }}>
              Carregando páginas...
            </div>
          ) : pages.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--adm-text-muted)' }}>
              Nenhuma página encontrada.
            </div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Título / ID</th>
                  <th>Ícone</th>
                  <th>Ordem</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pages.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(page => (
                  <tr key={page.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--adm-text)' }}>{page.group_name}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--adm-text)' }}>{page.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>/{page.id}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', background: 'var(--adm-surface-3)', padding: '4px 8px', borderRadius: '4px' }}>
                        {page.icon_name}
                      </span>
                    </td>
                    <td>{page.order_idx}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleEdit(page)}>
                          Editar
                        </button>
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(page.id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* PAGINATION FOOTER */}
        {!loading && pages.length > 0 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
            <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{pages.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, pages.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{pages.length}</strong> itens
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className="adm-btn adm-btn--outline adm-btn--sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              
              {Array.from({ length: Math.ceil(pages.length / pageSize) }).map((_, i) => {
                const totalPages = Math.ceil(pages.length / pageSize);
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
                disabled={currentPage === Math.ceil(pages.length / pageSize)}
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(pages.length / pageSize), prev + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '800px', width: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {isEditing ? 'Editar Página' : 'Nova Página'}
              </h3>
            </div>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="adm-field" style={{ flex: 1 }}>
                    <label>ID (Slug da URL) *</label>
                    <input 
                      type="text" 
                      className="adm-input" 
                      value={form.id} 
                      onChange={e => setForm({...form, id: e.target.value})} 
                      placeholder="ex: termos-de-uso" 
                      disabled={isEditing}
                      required 
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>O ID define a URL: /institucional?page=<strong>{form.id || '...'}</strong></div>
                  </div>
                  <div className="adm-field" style={{ flex: 1 }}>
                    <label>Ordem de Exibição</label>
                    <input 
                      type="number" 
                      className="adm-input" 
                      value={form.order_idx} 
                      onChange={e => setForm({...form, order_idx: Number(e.target.value)})} 
                    />
                  </div>
                </div>

                <div className="adm-field">
                  <label>Título da Página *</label>
                  <input 
                    type="text" 
                    className="adm-input" 
                    value={form.title} 
                    onChange={e => setForm({...form, title: e.target.value})} 
                    required 
                  />
                </div>

                <div className="adm-field">
                  <label>Subtítulo (Opcional)</label>
                  <input 
                    type="text" 
                    className="adm-input" 
                    value={form.subtitle} 
                    onChange={e => setForm({...form, subtitle: e.target.value})} 
                  />
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="adm-field" style={{ flex: 1 }}>
                    <label>Grupo no Menu *</label>
                    <input 
                      type="text" 
                      className="adm-input" 
                      value={form.group_name} 
                      onChange={e => setForm({...form, group_name: e.target.value})} 
                      placeholder="ex: Ajuda & Suporte" 
                      required 
                    />
                  </div>
                  <div className="adm-field" style={{ flex: 1 }}>
                    <label>Ícone do Menu (Opcional)</label>
                    <input 
                      type="text" 
                      className="adm-input" 
                      value={form.icon_name} 
                      onChange={e => setForm({...form, icon_name: e.target.value})} 
                      placeholder="ex: help, shield, file-text" 
                    />
                  </div>
                </div>

                <div className="adm-field" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                  <label>Conteúdo da Página (HTML)</label>
                  <div style={{ flex: 1, border: '1px solid var(--adm-border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <RichTextEditor 
                      value={form.content} 
                      onChange={value => setForm({...form, content: value})} 
                      placeholder="Escreva o conteúdo da página aqui..." 
                    />
                  </div>
                </div>
              </div>
              <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
                <button type="button" className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="adm-btn adm-btn--primary">Salvar Página</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
