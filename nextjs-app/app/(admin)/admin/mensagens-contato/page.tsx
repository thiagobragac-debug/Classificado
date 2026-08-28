'use client'

import React, { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminMensagensContato() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 1.500 mensagens de uma vez e
  // filtrava/paginava em memória — acima disso, mensagens mais antigas
  // (inclusive pendentes) somem da lista em silêncio, sem nenhum aviso.
  // Agora busca/filtro/paginação rodam de verdade no servidor via .range().
  const [totalFiltered, setTotalFiltered] = useState(0)

  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  // KPIs: contagens reais e globais (não afetadas pelo filtro/busca atual),
  // mesmo padrão já usado no dashboard e em /admin/verificacoes.
  const [total, setTotal] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [resolvidas, setResolvidas] = useState(0)

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadMessages()
  }, [currentPage, debouncedSearch, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  async function loadMessages() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase.from('contact_messages').select('*', { count: 'exact' })
    if (debouncedSearch) {
      const term = `%${debouncedSearch}%`
      q = q.or(`name.ilike.${term},email.ilike.${term},subject.ilike.${term}`)
    }
    if (statusFilter) q = q.eq('status', statusFilter)

    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, to)

    if (!error && data) {
      setMessages(data)
      if (count !== null) setTotalFiltered(count)
    } else if (error) {
      showToast('Erro ao carregar mensagens: ' + error.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const [r1, r2, r3] = await Promise.all([
      supabase.from('contact_messages').select('*', { count: 'exact', head: true }),
      supabase.from('contact_messages').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('contact_messages').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
    ])
    const firstError = [r1, r2, r3].find(r => r.error)?.error
    if (firstError) showToast('Erro ao carregar contadores: ' + firstError.message, 'error')
    setTotal(r1.count || 0)
    setPendentes(r2.count || 0)
    setResolvidas(r3.count || 0)
  }

  const handleSetStatus = async (id: string, status: 'resolved' | 'pending') => {
    const supabase = getSupabase()
    const updates: Record<string, any> = { status }
    updates.resolved_at = status === 'resolved' ? new Date().toISOString() : null

    const { data, error } = await supabase.from('contact_messages').update(updates).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setMessages(messages.map(m => m.id === id ? { ...m, status } : m))
      showToast(status === 'resolved' ? 'Mensagem marcada como respondida.' : 'Mensagem reaberta.', 'success')
      loadCounts()
    } else if (!error) {
      showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const totalPages = Math.ceil(totalFiltered / pageSize)

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Mensagens de Contato</h1>
        <p className="adm-page-sub">Mensagens enviadas pelo formulário "Fale Conosco" (/institucional?page=contato).</p>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
        </div>
        <div className="adm-stat-card" style={{ borderColor: 'rgba(245,158,11,.3)' }}>
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{pendentes}</div><div className="adm-stat-lbl">Pendentes</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{resolvidas}</div><div className="adm-stat-lbl">Respondidas</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por nome, e-mail ou assunto..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Respondida</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Assunto</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : messages.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Nenhuma mensagem encontrada.</td></tr>
              ) : messages.map(msg => (
                <React.Fragment key={msg.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}>
                    <td style={{ fontWeight: 600 }}>{msg.name}</td>
                    <td>
                      <div>{msg.email}</div>
                      {msg.phone && <div style={{ fontSize: '.8rem', color: 'var(--adm-text-secondary)' }}>{msg.phone}</div>}
                    </td>
                    <td>{msg.subject}</td>
                    <td>
                      {msg.status === 'pending' ? (
                        <span className="adm-badge adm-badge--amber">Pendente</span>
                      ) : (
                        <span className="adm-badge adm-badge--green">Respondida</span>
                      )}
                    </td>
                    <td>{new Date(msg.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {msg.status === 'pending' ? (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleSetStatus(msg.id, 'resolved')}>Marcar respondida</button>
                      ) : (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleSetStatus(msg.id, 'pending')}>Reabrir</button>
                      )}
                    </td>
                  </tr>
                  {expandedId === msg.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--adm-surface-2)', whiteSpace: 'pre-wrap', padding: '16px 20px' }}>
                        {msg.message}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
          <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
            Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalFiltered === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalFiltered)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalFiltered}</strong> itens
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="adm-btn adm-btn--outline adm-btn--sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`adm-btn adm-btn--sm ${currentPage === i + 1 ? 'adm-btn--primary' : 'adm-btn--outline'}`}
                style={{ width: '36px', height: '36px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setCurrentPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="adm-btn adm-btn--outline adm-btn--sm"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
