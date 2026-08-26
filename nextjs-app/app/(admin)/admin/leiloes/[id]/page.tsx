'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase, uploadAdImage } from '@/lib/supabase'
import { imageUrl } from '@/lib/storage'
import { showToast } from '@/lib/toast'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminAuctionLots() {
  const { confirm } = useConfirm()
  const params = useParams()
  const router = useRouter()
  const auctionId = params.id as string

  const [auction, setAuction] = useState<any>(null)
  const [lots, setLots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    lot_number: '',
    title: '',
    min_bid: 0,
    image: '',
    video: '',
    sire: '',
    dam: '',
    description: ''
  })
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (auctionId) {
      loadData()
    }
  }, [auctionId])

  async function loadData() {
    setLoading(true)
    const supabase = getSupabase()
    
    // Fetch Auction Event
    const { data: aucData, error: aucError } = await supabase
      .from('auction_events')
      .select('*')
      .eq('id', auctionId)
      .single()

    if (aucError) {
      showToast('Erro ao carregar leilão', 'error')
      router.push('/admin/leiloes')
      return
    }
    setAuction(aucData)

    // Fetch Lots
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): o admin nunca
    // mostrava lance atual/vencedor de um lote (só o lance inicial estático),
    // mesmo com lances reais já registrados em auction_lot_bids — não dava
    // pra acompanhar um leilão ao vivo pelo próprio painel. current_bid/
    // winner_id já são colunas reais de auction_lots (só faltava exibir).
    const { data: lotsData } = await supabase
      .from('auction_lots')
      .select('*, winner:profiles!winner_id(name, display_name)')
      .eq('auction_id', auctionId)
      .order('lot_number', { ascending: true }) // You might want to order numerically if possible, but alphabetically works for now if mixed with letters
    
    if (lotsData) {
      // Try to sort numerically if it's purely numbers
      const sortedLots = lotsData.sort((a: any, b: any) => {
        const numA = parseInt(a.lot_number)
        const numB = parseInt(b.lot_number)
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB
        return a.lot_number.localeCompare(b.lot_number)
      })
      setLots(sortedLots)
    }

    setLoading(false)
  }

  const openNew = () => {
    setEditingId(null)
    setForm({ lot_number: '', title: '', min_bid: 0, image: '', video: '', sire: '', dam: '', description: '' })
    setIsModalOpen(true)
  }

  // GAP CORRIGIDO (reteste do site, 2026-08-25): não existia UI de edição
  // de lote no admin — um erro de digitação no título/filiação/lance
  // mínimo só podia ser corrigido excluindo o lote e recriando, o que
  // também zerava qualquer lance real (current_bid/winner_id) já
  // registrado nele.
  const openEdit = (lot: any) => {
    setEditingId(lot.id)
    setForm({
      lot_number: lot.lot_number,
      title: lot.title,
      min_bid: lot.min_bid || 0,
      image: lot.image || '',
      video: lot.video || '',
      sire: lot.sire || '',
      dam: lot.dam || '',
      description: lot.description || ''
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.lot_number || !form.title) {
      return showToast('Preencha o número do lote e o título', 'error')
    }
    const supabase = getSupabase()
    const payload = {
      lot_number: form.lot_number,
      title: form.title,
      min_bid: Number(form.min_bid) || 0,
      image: form.image || null,
      video: form.video || null,
      sire: form.sire || null,
      dam: form.dam || null,
      description: form.description || null
    }

    if (editingId) {
      const { data, error } = await supabase.from('auction_lots').update(payload).eq('id', editingId).select()
      if (!error && data && data.length > 0) {
        setIsModalOpen(false)
        setEditingId(null)
        showToast('Lote atualizado com sucesso!', 'success')
        loadData()
      } else if (!error) {
        showToast('Nenhum lote foi alterado — verifique suas permissões.', 'error')
      } else {
        showToast('Erro ao atualizar lote: ' + error.message, 'error')
      }
      return
    }

    const { data, error } = await supabase.from('auction_lots').insert([{ ...payload, auction_id: auctionId }]).select()

    if (!error && data) {
      setLots([...lots, data[0]])
      setIsModalOpen(false)
      setForm({ lot_number: '', title: '', min_bid: 0, image: '', video: '', sire: '', dam: '', description: '' })
      showToast('Lote inserido com sucesso!', 'success')
      loadData() // Reload to fix sorting
    } else {
      showToast('Erro ao inserir lote: ' + error?.message, 'error')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    setUploading(true)
    try {
      const url = await uploadAdImage(file, 'auctions')
      if (url) {
        setForm(prev => ({ ...prev, image: url }))
        showToast('Imagem carregada com sucesso!', 'success')
      }
    } catch (err: any) {
      showToast('Erro ao fazer upload: ' + err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm('Tem certeza que deseja excluir este lote?'))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('auction_lots').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      setLots(lots.filter(l => l.id !== id))
      showToast('Lote excluído!', 'success')
    } else if (!error) {
      showToast('Nenhum lote foi excluído — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando dados do leilão...</div>
  }

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link href="/admin/leiloes" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--adm-text-muted)', textDecoration: 'none', marginBottom: '8px', fontSize: '0.9rem' }}>
            &larr; Voltar para Leilões
          </Link>
          <h1 className="adm-page-title">Gestão de Lotes: {auction?.title}</h1>
          <p className="adm-page-sub">{new Date(auction?.date).toLocaleString('pt-BR')} • {lots.length} {lots.length === 1 ? 'Lote cadastrado' : 'Lotes cadastrados'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--primary" onClick={openNew}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Lote
          </button>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Lote Nº</th>
                <th>Animal / Título</th>
                <th>Filiação</th>
                <th>Lance Inicial</th>
                <th>Lance Atual</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--adm-text-muted)' }}>Nenhum lote cadastrado neste leilão.</td></tr>
              ) : lots.map(lot => (
                <tr key={lot.id}>
                  <td>
                    <div className="adm-badge" style={{ background: 'var(--adm-surface-3)', fontSize: '1rem', fontWeight: 'bold' }}>
                      {lot.lot_number}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={imageUrl(lot.image, 'https://placehold.co/100x100?text=Sem+Foto')} alt="" style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{lot.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lot.description || 'Sem descrição'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>
                      {lot.sire ? <div><strong style={{ color: 'var(--adm-blue)' }}>Pai:</strong> {lot.sire}</div> : null}
                      {lot.dam ? <div><strong style={{ color: 'var(--adm-accent)' }}>Mãe:</strong> {lot.dam}</div> : null}
                      {!lot.sire && !lot.dam && <span style={{ color: 'var(--adm-text-muted)' }}>-</span>}
                    </div>
                  </td>
                  <td>
                    {lot.min_bid > 0 ? `R$ ${lot.min_bid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td>
                    {lot.current_bid > 0 ? (
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--adm-green)' }}>
                          R$ {Number(lot.current_bid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        {lot.winner && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>
                            🏆 {lot.winner.display_name || lot.winner.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--adm-text-muted)' }}>Sem lances</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(lot)}>
                        Editar
                      </button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-border)' }} onClick={() => handleDelete(lot.id)}>
                        Excluir
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
        <div className="adm-overlay open" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '800px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Lote' : 'Inserir Novo Lote'}
              </h3>
            </div>
            
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="adm-field">
                <label>Número do Lote *</label>
                <input type="text" className="adm-input" placeholder="Ex: 01, 01A, 02..." value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })} />
              </div>

              <div className="adm-field">
                <label>Animal / Título *</label>
                <input type="text" className="adm-input" placeholder="Ex: Vaca Holandesa PO" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              
              <div className="adm-field">
                <label>Pai (Sire) (Opcional)</label>
                <input type="text" className="adm-input" placeholder="Nome do Pai" value={form.sire} onChange={e => setForm({ ...form, sire: e.target.value })} />
              </div>

              <div className="adm-field">
                <label>Mãe (Dam) (Opcional)</label>
                <input type="text" className="adm-input" placeholder="Nome da Mãe" value={form.dam} onChange={e => setForm({ ...form, dam: e.target.value })} />
              </div>

              <div className="adm-field">
                <label>Foto (URL ou Arquivo) (Opcional)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" className="adm-input" placeholder="https://..." value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} style={{ flex: 1 }} />
                  <label className="adm-btn adm-btn--outline" style={{ cursor: 'pointer', whiteSpace: 'nowrap', opacity: uploading ? 0.7 : 1 }}>
                    {uploading ? 'Enviando...' : 'Fazer Upload'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <label>Link do Vídeo (YouTube/Vimeo) (Opcional)</label>
                <input type="text" className="adm-input" placeholder="https://..." value={form.video} onChange={e => setForm({ ...form, video: e.target.value })} />
              </div>

              <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Lance Inicial (R$)</label>
                <input type="number" className="adm-input" min="0" step="50" value={form.min_bid} onChange={e => setForm({ ...form, min_bid: Number(e.target.value) })} />
              </div>

              <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Descrição do Lote (Opcional)</label>
                <textarea className="adm-textarea" rows={3} placeholder="Informações adicionais sobre o lote..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}></textarea>
              </div>
            </div>
            </div>

            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>{editingId ? 'Salvar Alterações' : 'Salvar Lote'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
