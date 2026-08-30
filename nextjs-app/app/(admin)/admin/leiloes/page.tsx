'use client'

import React, { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { getSupabase, uploadAdImage } from '@/lib/supabase'
import { imageUrl } from '@/lib/storage'
import { showToast } from '@/lib/toast'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminLeiloes() {
  const { confirm } = useConfirm()
  const [auctions, setAuctions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 1.500 leilões de uma vez e
  // filtrava/paginava em memória — acima disso, leilões mais antigos somem
  // da lista em silêncio. Agora busca/filtro/paginação rodam de verdade no
  // servidor via .range().
  const [totalFiltered, setTotalFiltered] = useState(0)
  const [counts, setCounts] = useState({ total: 0, emAndamento: 0, agendados: 0, finalizados: 0, cancelados: 0 })

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', 
    date: '', 
    status: 'scheduled',
    youtube: '',
    cover: '',
    catalog: '',
    min_bid: 0,
    step: 0,
    commission: 0,
    accepts_bids: true
  })
  const [uploading, setUploading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadAuctions()
  }, [currentPage, debouncedSearch, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  async function loadAuctions() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase.from('auction_events').select('*', { count: 'exact' })
    if (debouncedSearch) q = q.ilike('title', `%${debouncedSearch}%`)
    if (statusFilter) q = q.eq('status', statusFilter)

    const { data: auctionsData, count, error: auctionsError } = await q.order('date', { ascending: false }).range(from, to)

    if (!auctionsError && auctionsData) {
      // Contagem de lotes só da página atual (não da base inteira) — com
      // paginação real não faz sentido mais buscar auction_lots por completo.
      const auctionIds = auctionsData.map((a: any) => a.id)
      const { data: lotsData } = auctionIds.length
        ? await supabase.from('auction_lots').select('auction_id').in('auction_id', auctionIds)
        : { data: [] as any[] }

      const auctionsWithCounts = auctionsData.map((auc: any) => {
        const count = lotsData?.filter((l: any) => l.auction_id === auc.id).length || 0;
        return { ...auc, lotsCount: count };
      })

      setAuctions(auctionsWithCounts)
      if (count !== null) setTotalFiltered(count)
    } else if (auctionsError) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "0 leilões" sem
      // nenhum aviso — indistinguível de base realmente vazia.
      showToast('Erro ao carregar leilões: ' + auctionsError.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('auction_events').select('*', { count: 'exact', head: true }),
      supabase.from('auction_events').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('auction_events').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
      supabase.from('auction_events').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
      supabase.from('auction_events').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
    ])
    const firstError = [r1, r2, r3, r4, r5].find(r => r.error)?.error
    if (firstError) showToast('Erro ao carregar contadores: ' + firstError.message, 'error')
    setCounts({ total: r1.count || 0, emAndamento: r2.count || 0, agendados: r3.count || 0, finalizados: r4.count || 0, cancelados: r5.count || 0 })
  }

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('auction_events').update({ status: newStatus }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      showToast(`Status do leilão atualizado para ${newStatus}!`, 'success')
      // BUG CORRIGIDO: com filtro/paginação real de servidor, um patch só
      // local deixava o leilão visível mesmo depois de deixar de bater com
      // o filtro de status atual. Recarrega de verdade.
      loadAuctions()
      loadCounts()
    } else if (!error) {
      showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro ao atualizar status: ' + error.message, 'error')
    }
  }

  const emptyForm = { title: '', date: '', status: 'scheduled', youtube: '', cover: '', catalog: '', min_bid: 0, step: 0, commission: 0, accepts_bids: true }

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setIsModalOpen(true)
  }

  // GAP CORRIGIDO: não existia UI de edição de leilão no admin — corrigir
  // título/data/lance mínimo/comissão/capa depois de criado exigia mexer
  // direto no banco. Mesmo padrão de openEdit já usado em auction_lots
  // ([id]/page.tsx).
  const openEdit = (auc: any) => {
    setEditingId(auc.id)
    // datetime-local espera "YYYY-MM-DDTHH:mm" no horário local; auc.date
    // vem em ISO/UTC do banco.
    const d = new Date(auc.date)
    const pad = (n: number) => String(n).padStart(2, '0')
    const localDateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setForm({
      title: auc.title || '',
      date: localDateTime,
      status: auc.status,
      youtube: auc.youtube || '',
      cover: auc.cover || '',
      catalog: auc.catalog || '',
      min_bid: auc.min_bid || 0,
      step: auc.step || 0,
      commission: auc.commission || 0,
      accepts_bids: auc.accepts_bids ?? true
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.date) {
      return showToast('Preencha o título e a data', 'error')
    }
    const supabase = getSupabase()
    const payload = {
      title: form.title,
      date: new Date(form.date).toISOString(),
      status: form.status,
      youtube: form.youtube || null,
      cover: form.cover || null,
      catalog: form.catalog || null,
      min_bid: Number(form.min_bid) || 0,
      step: Number(form.step) || 0,
      commission: Number(form.commission) || 0,
      accepts_bids: form.accepts_bids
    }

    if (editingId) {
      const { data, error } = await supabase.from('auction_events').update(payload).eq('id', editingId).select()
      if (!error && data && data.length > 0) {
        setIsModalOpen(false)
        setEditingId(null)
        setForm(emptyForm)
        showToast('Leilão atualizado com sucesso!', 'success')
        loadAuctions()
        loadCounts()
      } else if (!error) {
        showToast('Nenhum leilão foi atualizado — verifique permissões ou se o registro ainda existe.', 'error')
      } else {
        showToast('Erro ao atualizar leilão: ' + error.message, 'error')
      }
      return
    }

    const { data, error } = await supabase.from('auction_events').insert([payload]).select()

    if (!error && data) {
      setIsModalOpen(false)
      setForm(emptyForm)
      showToast('Leilão criado com sucesso!', 'success')
      // BUG CORRIGIDO: a lista é ordenada por `date` (data do evento, não
      // criação) e agora é paginada de verdade no servidor — inserir
      // otimista no topo do array local ficava com a ordenação errada, o
      // "Mostrando X de Y" desatualizado, e podia até duplicar/pular um
      // item na página seguinte porque o .range() do servidor desconhecia
      // essa linha extra. Recarrega de verdade em vez de inserir na mão.
      loadAuctions()
      loadCounts()
    } else {
      showToast('Erro ao criar leilão: ' + error?.message, 'error')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    setUploading(true)
    try {
      const url = await uploadAdImage(file, 'auctions')
      if (url) {
        setForm(prev => ({ ...prev, cover: url }))
        showToast('Capa carregada com sucesso!', 'success')
      }
    } catch (err: any) {
      showToast('Erro ao fazer upload: ' + err.message, 'error')
    } finally {
      loadAuctions()
      setUploading(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === auctions.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(auctions.map(a => a.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.length === 0) return

    // GAP CORRIGIDO: "Cancelar Todos" cancelava leilões de verdade sem
    // nenhuma confirmação, a poucos pixels do botão que só limpa a seleção
    // — fácil de clicar no errado. Confirma e avisa se algum selecionado
    // está Ao Vivo.
    if (newStatus === 'cancelled') {
      const selecionados = auctions.filter(a => selectedIds.includes(a.id))
      const temAoVivo = selecionados.some(a => a.status === 'live')
      const mensagem = `Cancelar ${selectedIds.length} ${selectedIds.length === 1 ? 'leilão selecionado' : 'leilões selecionados'}?${temAoVivo ? ' Atenção: pelo menos um está Ao Vivo no momento.' : ''}`
      if (!(await confirm(mensagem, 'Cancelar leilões'))) return
    }

    const supabase = getSupabase()

    const { data, error } = await supabase.from('auction_events')
      .update({ status: newStatus })
      .in('id', selectedIds)
      .select()

    if (!error && data && data.length > 0) {
      showToast(`${data.length} leilões atualizados para ${newStatus}!`, 'success')
      setSelectedIds([])
      loadAuctions()
      loadCounts()
    } else if (!error) {
      showToast('Nenhum leilão foi atualizado — verifique permissões ou se os registros ainda existem.', 'error')
    } else {
      showToast('Erro ao atualizar leilões: ' + error.message, 'error')
    }
  }

  const totalPages = Math.ceil(totalFiltered / pageSize)

  // KPIs: globais, vindos de loadCounts() — não dependem do filtro/busca atual
  const { total, emAndamento, agendados, finalizados, cancelados } = counts

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gestão de Leilões e Remates</h1>
          <p className="adm-page-sub">Crie eventos, gerencie transmissões e associe lotes.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--primary" onClick={openNew}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Leilão
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{emAndamento}</div><div className="adm-stat-lbl">Ao Vivo</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{agendados}</div><div className="adm-stat-lbl">Agendados</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-text-muted)' }}>{finalizados}</div><div className="adm-stat-lbl">Finalizados</div></div>
          <div className="adm-stat-icon" style={{ background: 'var(--adm-surface-3)', color: 'var(--adm-text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{cancelados}</div><div className="adm-stat-lbl">Cancelados</div></div>
          <div className="adm-stat-icon" style={{ background: 'var(--adm-red-pale)', color: 'var(--adm-red)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por título..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="scheduled">Agendado</option>
            <option value="live">Ao Vivo</option>
            <option value="closed">Finalizado</option>
            <option value="cancelled">Cancelado</option>
            <option value="active">Ativo (Genérico)</option>
            <option value="draft">Rascunho</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }}
                         checked={auctions.length > 0 && selectedIds.length === auctions.length}
                         onChange={toggleSelectAll} />
                </th>
                <th>Evento</th>
                <th>Data / Hora</th>
                <th>Status</th>
                <th>Lotes</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : auctions.map(auc => (
                <tr key={auc.id} style={{ background: selectedIds.includes(auc.id) ? 'var(--adm-surface-2)' : 'transparent' }}>
                  <td>
                    <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }}
                           checked={selectedIds.includes(auc.id)}
                           onChange={() => toggleSelect(auc.id)} />
                  </td>
                  <td>
                    <Link href={`/admin/leiloes/${auc.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'inherit' }} className="adm-hover-link">
                      <img src={imageUrl(auc.cover, 'https://placehold.co/100x100?text=Sem+Capa')} alt="" style={{ width: '60px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{auc.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--adm-accent)', marginTop: '2px' }}>Gerenciar Lotes &rarr;</div>
                      </div>
                    </Link>
                  </td>
                  <td>{new Date(auc.date).toLocaleString('pt-BR')}</td>
                  <td>
                    {auc.status === 'live' && <span className="adm-badge adm-badge--red">Ao Vivo</span>}
                    {auc.status === 'scheduled' && <span className="adm-badge adm-badge--amber">Agendado</span>}
                    {auc.status === 'closed' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)' }}>Finalizado</span>}
                    {auc.status === 'cancelled' && <span className="adm-badge adm-badge--blocked">Cancelado</span>}
                    {auc.status === 'active' && <span className="adm-badge adm-badge--green">Ativo</span>}
                    {auc.status === 'draft' && <span className="adm-badge" style={{ background: 'var(--adm-surface-2)' }}>Rascunho</span>}
                    {!['live', 'scheduled', 'closed', 'cancelled', 'active', 'draft'].includes(auc.status) && <span className="adm-badge">{auc.status}</span>}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: auc.lotsCount > 0 ? 'var(--adm-green)' : 'var(--adm-text-muted)' }}>
                      {auc.lotsCount} {auc.lotsCount === 1 ? 'lote' : 'lotes'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(auc)}>Editar</button>
                      {['scheduled', 'active', 'draft'].includes(auc.status) && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleStatusUpdate(auc.id, 'live')}>Iniciar Transmissão</button>
                      )}
                      {auc.status === 'live' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleStatusUpdate(auc.id, 'closed')}>Finalizar</button>
                      )}
                      {auc.status === 'closed' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-text-muted)' }} onClick={() => handleStatusUpdate(auc.id, 'scheduled')}>Reabrir</button>
                      )}
                      {['scheduled', 'live', 'active', 'draft'].includes(auc.status) && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-border)' }} onClick={() => handleStatusUpdate(auc.id, 'cancelled')}>Cancelar</button>
                      )}
                      {auc.status === 'cancelled' && (
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-text-muted)' }} onClick={() => handleStatusUpdate(auc.id, 'scheduled')}>Reagendar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
            <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalFiltered)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalFiltered}</strong> itens
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
        <div className="adm-overlay open" onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); setEditingId(null) } }}>
          <div className="adm-modal" style={{ maxWidth: '800px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Leilão / Remate' : 'Novo Leilão / Remate'}
              </h3>
            </div>
            
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Título do Evento *</label>
                <input type="text" className="adm-input" placeholder="Ex: Leilão Elite Virtual" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              
              <div className="adm-field">
                <label>Data e Hora *</label>
                <input type="datetime-local" className="adm-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              
              <div className="adm-field">
                <label>Status Inicial *</label>
                <select className="adm-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="scheduled">Agendado</option>
                  <option value="active">Ativo (Público)</option>
                  <option value="draft">Rascunho</option>
                </select>
              </div>

              <div className="adm-field">
                <label>ID do Vídeo YouTube (Opcional)</label>
                <input type="text" className="adm-input" placeholder="Ex: dQw4w9WgXcQ" value={form.youtube} onChange={e => setForm({ ...form, youtube: e.target.value })} />
              </div>

              <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Capa (URL ou Arquivo) (Opcional)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" className="adm-input" placeholder="https://..." value={form.cover} onChange={e => setForm({ ...form, cover: e.target.value })} style={{ flex: 1 }} />
                  <label className="adm-btn adm-btn--outline" style={{ cursor: 'pointer', whiteSpace: 'nowrap', opacity: uploading ? 0.7 : 1 }}>
                    {uploading ? 'Enviando...' : 'Fazer Upload'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <label>Lance Mínimo Padrão (R$)</label>
                <input type="number" className="adm-input" min="0" step="50" value={form.min_bid} onChange={e => setForm({ ...form, min_bid: Number(e.target.value) })} />
              </div>

              <div className="adm-field">
                <label>Incremento de Lance (R$)</label>
                <input type="number" className="adm-input" min="0" step="10" value={form.step} onChange={e => setForm({ ...form, step: Number(e.target.value) })} />
              </div>

              <div className="adm-field">
                <label>Comissão da Plataforma (%)</label>
                <input type="number" className="adm-input" min="0" max="100" value={form.commission} onChange={e => setForm({ ...form, commission: Number(e.target.value) })} />
              </div>
              
              <div className="adm-field" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px' }}>
                <input type="checkbox" id="accepts_bids" checked={form.accepts_bids} onChange={e => setForm({ ...form, accepts_bids: e.target.checked })} style={{ width: '20px', height: '20px', accentColor: 'var(--adm-accent)' }} />
                <label htmlFor="accepts_bids" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>Permitir Lances no Evento</label>
              </div>
            </div>
            </div>

            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => { setIsModalOpen(false); setEditingId(null) }}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave} disabled={uploading}>
                {uploading ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar Leilão')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--adm-surface)', border: '1px solid var(--adm-border)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '12px 24px',
          borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1000
        }}>
          <div style={{ fontWeight: 600, color: 'var(--adm-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderLeft: '1px solid var(--adm-border)', paddingLeft: '20px' }}>
            <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setSelectedIds([])}>Limpar seleção</button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleBulkStatusUpdate('live')}>Mover para Ao Vivo</button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-amber)', borderColor: 'var(--adm-amber)' }} onClick={() => handleBulkStatusUpdate('scheduled')}>Mover para Agendado</button>
            <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-text-muted)' }} onClick={() => handleBulkStatusUpdate('closed')}>Finalizar Todos</button>
            <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleBulkStatusUpdate('cancelled')}>Cancelar Todos</button>
          </div>
        </div>
      )}
    </>
  )
}
