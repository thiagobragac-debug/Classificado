'use client'

import React, { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

const PAGE_SIZE = 10

// Formata CPF: 00000000000 -> 000.000.000-00
function formatCpf(v: string) {
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// Formata CNPJ: 00000000000100 -> 00.000.000/0001-00
function formatCnpj(v: string) {
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function formatCpfCnpj(raw: string) {
  const digits = raw?.replace(/\D/g, '') || ''
  if (digits.length === 11) return formatCpf(digits)
  if (digits.length === 14) return formatCnpj(digits)
  return raw || '—'
}

function getTipoLabel(type: string, cpfCnpj?: string) {
  const digits = cpfCnpj?.replace(/\D/g, '') || ''
  const resolved = digits.length === 14 ? 'pessoa_juridica' : type || 'pessoa_fisica'

  if (resolved === 'pessoa_juridica') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: '#eff6ff', color: '#1d4ed8',
        padding: '3px 10px', borderRadius: '20px',
        fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap'
      }}>
        🏢 Pessoa Jurídica
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: '#f0fdf4', color: '#15803d',
      padding: '3px 10px', borderRadius: '20px',
      fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      👤 Pessoa Física
    </span>
  )
}

export default function VerificacoesPage() {
  const { confirm } = useConfirm()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })

  // Modal de documentos
  const [docModal, setDocModal] = useState<any | null>(null)
  // O banco guarda o PATH do objeto no bucket privado kyc-docs, não uma URL.
  // Antes o modal usava o valor cru em <img src>, que vinha de getPublicUrl()
  // sobre bucket privado e sempre respondia 403 — nenhum documento aparecia.
  const [docUrls, setDocUrls] = useState<Record<string, string | null> | null>(null)
  const [docUrlsError, setDocUrlsError] = useState('')

  // Pede ao servidor URLs assinadas de vida curta (5 min). O admin é
  // autenticado lá, e os paths saem do próprio registro — não do cliente.
  const abrirDocumentos = async (req: any) => {
    setDocModal(req)
    setDocUrls(null)
    setDocUrlsError('')
    try {
      const res = await fetch('/api/admin/kyc-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: req.id }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Falha ao carregar documentos')
      setDocUrls(payload.urls)
    } catch (err) {
      setDocUrlsError((err as Error).message)
    }
  }
  // Lightbox de imagem individual
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => { loadRequests() }, [page])
  useEffect(() => { loadCounts() }, [])

  async function loadRequests() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count } = await supabase
      .from('verification_requests')
      .select('*, profiles(name, display_name, phone_whatsapp)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (data) setRequests(data)
    if (count !== null) setTotal(count)
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const [{ count: tot }, { count: pend }, { count: appr }, { count: rej }] = await Promise.all([
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    ])
    setCounts({ total: tot || 0, pending: pend || 0, approved: appr || 0, rejected: rej || 0 })
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // profiles.verified e kyc_status viraram colunas privilegiadas (migration
  // 20260822120400) — só o service_role escreve nelas, pelo mesmo motivo que
  // impedia o usuário de se autoverificar. A rota confere is_admin no servidor.
  const aplicarVerificacao = async (userId: string, verified: boolean, requestId?: string, reason?: string) => {
    const res = await fetch('/api/admin/verify-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, verified, requestId, reason }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || 'Falha ao atualizar verificação')
  }

  const handleApprove = async (reqId: string, userId: string, name: string) => {
    if (!(await confirm(`Aprovar e conceder selo verde para "${name}"?`))) return
    try {
      await aplicarVerificacao(userId, true, reqId)
      showToast('Selo concedido com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao conceder selo: ' + (err as Error).message, 'error')
      return
    }
    setDocModal(null)
    loadRequests()
    loadCounts()
  }

  const handleReject = async (reqId: string, userId: string, name: string) => {
    const reason = prompt(`Motivo da rejeição para "${name}" (ex: Documento ilegível):`)
    if (!reason) return
    // BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25): rejeitar fazia
    // update direto em verification_requests, sem passar por /api/admin/
    // verify-user — profiles.kyc_status (coluna privilegiada, só service_role
    // escreve) nunca era sincronizado, e o usuário ficava com o badge preso em
    // "pending" pra sempre, mesmo com a solicitação já marcada 'rejected'.
    try {
      await aplicarVerificacao(userId, false, reqId, reason)
      showToast('Solicitação rejeitada.', 'info')
    } catch (err) {
      showToast('Erro ao rejeitar: ' + (err as Error).message, 'error')
      return
    }
    setDocModal(null)
    loadRequests()
    loadCounts()
  }

  const getUserName = (req: any) =>
    req.profiles?.display_name || req.profiles?.name || 'Usuário Desconhecido'

  const statusBadge = (s: string) => {
    const cfg: Record<string, { color: string; dot: string; label: string }> = {
      pending:  { color: '#6b7280', dot: '#6b7280',  label: 'Pendente' },
      approved: { color: '#16a34a', dot: '#16a34a', label: 'Aprovada' },
      rejected: { color: '#dc2626', dot: '#dc2626', label: 'Rejeitada' },
    }
    const c = cfg[s] || { color: '#6b7280', dot: '#6b7280', label: s }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.color, fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
        {c.label}
      </span>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Solicitações de Verificação</h1>
          <p className="adm-page-sub">Aprove ou rejeite os pedidos de Selo de Vendedor Verificado enviados pelos usuários.</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total',      value: counts.total,    color: 'var(--adm-text)' },
          { label: 'Pendentes',  value: counts.pending,  color: '#f59e0b' },
          { label: 'Aprovadas',  value: counts.approved, color: 'var(--adm-text)' },
          { label: 'Rejeitadas', value: counts.rejected, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} className="adm-card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--adm-text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="adm-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--adm-text-muted)' }}>Carregando...</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--adm-text-muted)' }}>
            Nenhuma solicitação encontrada.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--adm-border)' }}>
                  {['DATA', 'USUÁRIO', 'CPF / CNPJ', 'TIPO', 'STATUS', 'AÇÕES'].map(col => (
                    <th key={col} style={{
                      padding: '12px 16px',
                      textAlign: col === 'AÇÕES' ? 'right' : 'left',
                      fontSize: '0.72rem', fontWeight: 600,
                      color: 'var(--adm-text-muted)',
                      letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(req => {
                  const name = getUserName(req)
                  return (
                    <tr key={req.id}
                      style={{ borderBottom: '1px solid var(--adm-border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--adm-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 16px', fontSize: '0.88rem', color: 'var(--adm-text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(req.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.95rem' }}>
                        {name}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '0.88rem', fontFamily: 'monospace', color: 'var(--adm-text-muted)' }}>
                        {formatCpfCnpj(req.cpf_cnpj)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {getTipoLabel(req.type, req.cpf_cnpj)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {statusBadge(req.status)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {/* Ver documentos — sempre visível */}
                          <button
                            onClick={() => abrirDocumentos(req)}
                            style={{
                              padding: '6px 14px', fontSize: '0.82rem',
                              border: '1px solid var(--adm-border)', borderRadius: '6px',
                              background: 'transparent', cursor: 'pointer',
                              color: 'var(--adm-text)', display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                          >
                            🔍 Ver Docs
                          </button>
                          {req.status === 'pending' && (
                            <>
                              <button
                                className="adm-btn adm-btn--primary"
                                style={{ background: '#16a34a', borderColor: '#16a34a', fontSize: '0.85rem', padding: '6px 14px' }}
                                onClick={() => handleApprove(req.id, req.user_id, name)}
                              >
                                Aprovar
                              </button>
                              <button
                                className="adm-btn adm-btn--outline"
                                style={{ fontSize: '0.85rem', padding: '6px 14px', color: '#dc2626', borderColor: '#dc2626' }}
                                onClick={() => handleReject(req.id, req.user_id, name)}
                              >
                                Recusar
                              </button>
                            </>
                          )}
                          {req.status !== 'pending' && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)', fontStyle: 'italic', lineHeight: '30px' }}>
                              {req.status === 'approved' ? 'Aprovado ✓' : 'Recusado ✗'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
                <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
                  Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(page * PAGE_SIZE, total)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{total}</strong> itens
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="adm-btn adm-btn--outline adm-btn--sm" 
                    disabled={page === 1}
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </button>
                  
                  {Array.from({ length: totalPages || 1 }).map((_, i) => {
                    if (totalPages > 7) {
                      if (i !== 0 && i !== totalPages - 1 && Math.abs(page - 1 - i) > 1) {
                        if (Math.abs(page - 1 - i) === 2) return <span key={i} style={{ padding: '0 8px', color: 'var(--adm-text-secondary)' }}>...</span>
                        return null
                      }
                    }
                    
                    return (
                      <button 
                        key={i} 
                        className={`adm-btn adm-btn--sm ${page === i + 1 ? 'adm-btn--primary' : 'adm-btn--outline'}`}
                        style={{ width: '36px', height: '36px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setPage(i + 1)}
                      >
                        {i + 1}
                      </button>
                    )
                  })}

                  <button 
                    className="adm-btn adm-btn--outline adm-btn--sm" 
                    disabled={page >= (totalPages || 1)}
                    onClick={() => setPage(prev => Math.min(totalPages || 1, prev + 1))}
                  >
                    Próxima
                  </button>
                </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Visualizar Documentos ── */}
      {docModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setDocModal(null) }}
        >
          <div style={{ background: 'var(--adm-surface)', borderRadius: '16px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--adm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem' }}>Documentos — {getUserName(docModal)}</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>
                  {docModal.cpf_cnpj
                    ? <>{formatCpfCnpj(docModal.cpf_cnpj)} &nbsp;·&nbsp;</>
                    : null
                  }
                  Enviado em {new Date(docModal.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button onClick={() => setDocModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: 'var(--adm-text-muted)', lineHeight: 1 }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {/* Info row */}
              <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                <div><span style={{ color: 'var(--adm-text-muted)' }}>Tipo:</span> &nbsp;{getTipoLabel(docModal.type, docModal.cpf_cnpj)}</div>
                <div><span style={{ color: 'var(--adm-text-muted)' }}>Status:</span> &nbsp;{statusBadge(docModal.status)}</div>
                {docModal.profiles?.phone_whatsapp && (
                  <div><span style={{ color: 'var(--adm-text-muted)' }}>Tel:</span> <strong>{docModal.profiles.phone_whatsapp}</strong></div>
                )}
              </div>

              {docUrlsError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  ⚠️ {docUrlsError}
                </div>
              )}
              {!docUrls && !docUrlsError && (
                <div style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                  Gerando links seguros dos documentos…
                </div>
              )}

              {/* Docs grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: 'CNH / RG — Frente', url: docUrls?.document_front ?? '' },
                  { label: 'CNH / RG — Verso',  url: docUrls?.document_back ?? '' },
                  { label: 'Selfie c/ Documento', url: docUrls?.selfie ?? '' },
                ].map(({ label, url }) => (
                  <div key={label}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--adm-text-muted)' }}>{label}</p>
                    <div
                      onClick={() => setLightbox(url)}
                      style={{ cursor: 'zoom-in', borderRadius: '10px', overflow: 'hidden', border: '2px solid var(--adm-border)', position: 'relative' }}
                      title="Clique para ampliar"
                    >
                      <img
                        src={url}
                        alt={label}
                        style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                        onError={e => {
                          const el = e.target as HTMLImageElement
                          el.style.height = '80px'
                          el.style.objectFit = 'contain'
                          el.style.padding = '20px'
                          el.style.background = '#f8fafc'
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.45)', borderRadius: '6px', padding: '2px 7px', color: 'white', fontSize: '0.7rem' }}>
                        🔍 Ampliar
                      </div>
                    </div>
                    <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: '6px', fontSize: '0.78rem', color: 'var(--adm-text-muted)', textDecoration: 'none' }}>
                      ↗ Abrir original
                    </a>
                  </div>
                ))}
              </div>

              {docModal.status === 'rejected' && docModal.reason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#b91c1c', fontSize: '0.9rem' }}>
                  <strong>Motivo anterior:</strong> {docModal.reason}
                </div>
              )}

              {/* Actions */}
              {docModal.status === 'pending' ? (
                <div style={{ display: 'flex', gap: '10px', paddingTop: '20px', borderTop: '1px solid var(--adm-border)', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleReject(docModal.id, docModal.user_id, getUserName(docModal))}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '10px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                      border: '1.5px solid #dc2626', background: 'white', color: '#dc2626',
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>✕</span> Recusar
                  </button>
                  <button
                    onClick={() => handleApprove(docModal.id, docModal.user_id, getUserName(docModal))}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '10px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                      border: 'none', background: '#16a34a', color: 'white',
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>✓</span> Aprovar e Conceder Selo
                  </button>
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--adm-text-muted)', fontSize: '0.9rem', margin: 0, paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
                  Solicitação já <strong>{docModal.status === 'approved' ? 'aprovada ✓' : 'recusada ✗'}</strong>.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox: Imagem ampliada ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: '20px' }}
        >
          <img
            src={lightbox}
            alt="Documento ampliado"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '1.8rem', cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  )
}
