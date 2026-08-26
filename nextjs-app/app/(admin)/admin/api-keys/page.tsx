'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function AdminApiKeys() {
  const { confirm } = useConfirm()
  const [keys, setKeys] = useState<any[]>([])
  const [newToken, setNewToken] = useState<string | null>(null) // Token shown once after creation
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState({
    partner_name: '',
    email: '',
    permissions: ['read_ads'],
    environment: 'production',
    rate_limit: 100,
    is_active: true
  })

  useEffect(() => {
    loadKeys()
  }, [])

  async function loadKeys() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false }).limit(1500)
    if (!error && data) {
      setKeys(data)
    }
    setLoading(false)
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('api_keys').update({ is_active: !currentStatus }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setKeys(keys.map(k => k.id === id ? { ...k, is_active: !currentStatus } : k))
    } else if (!error) {
      showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm('Deseja realmente excluir esta chave?'))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('api_keys').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      setKeys(keys.filter(k => k.id !== id))
    } else if (!error) {
      showToast('Nenhuma chave foi excluída — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const generateSecret = () => {
    // Generate a cryptographically strong random token using Web Crypto API
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
    return 'tk_' + hex
  }

  const hashSecret = async (secret: string): Promise<string> => {
    // Hash the token with SHA-256 — only the hash is stored in the DB
    const encoder = new TextEncoder()
    const data = encoder.encode(secret)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const handleSave = async () => {
    if (!form.partner_name || !form.email) return showToast('Preencha nome do parceiro e e-mail', 'error')
    
    const supabase = getSupabase()
    const secret = generateSecret()        // Raw token — shown to admin ONCE, never stored
    const secretHash = await hashSecret(secret) // SHA-256 hash — stored in DB

    const payload = {
      ...form,
      secret_hash: secretHash,             // ✅ Only the hash persists
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('api_keys').insert(payload).select().single()
    if (!error && data) {
      setKeys([data, ...keys])
      setIsModalOpen(false)
      setNewToken(secret) // Show raw token once in dedicated modal
    } else {
      showToast('Erro: ' + error?.message, 'error')
    }
  }

  const total = keys.length
  const ativos = keys.filter(k => k.is_active).length
  const revogadas = keys.filter(k => !k.is_active).length
  const hoje = keys.filter(k => new Date(k.created_at).toDateString() === new Date().toDateString()).length

  const totalPages = Math.ceil(keys.length / pageSize)
  const paginatedKeys = keys.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Chaves de API REST</h1>
          <p className="adm-page-sub">Gerencie tokens de acesso para integrações e parceiros.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/admin/api-keys/usage" className="adm-btn adm-btn--outline">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Dashboard de Uso
          </Link>
          <button className="adm-btn adm-btn--primary" onClick={() => {
            setForm({ partner_name: '', email: '', permissions: ['read_ads'], environment: 'production', rate_limit: 100, is_active: true })
            setIsModalOpen(true)
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Gerar Nova Chave
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '24px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Integrações</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{revogadas}</div><div className="adm-stat-lbl">Revogadas</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{hoje}</div><div className="adm-stat-lbl">Criadas Hoje</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th>Parceiro</th>
                <th>E-mail / Ambiente</th>
                <th>Permissões</th>
                <th>Status</th>
                <th>Criado em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Carregando chaves...</td></tr>
              ) : keys.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Nenhuma chave gerada ainda.</td></tr>
              ) : paginatedKeys.map(k => (
                <tr key={k.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{k.partner_name}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{k.email}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)' }}>{k.environment}</div>
                  </td>
                  <td>
                    {Array.isArray(k.permissions) ? k.permissions.join(', ') : k.permissions}
                  </td>
                  <td>
                    {k.is_active ? <span className="adm-badge adm-badge--green">Ativa</span> : <span className="adm-badge adm-badge--amber">Inativa</span>}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleToggleStatus(k.id, k.is_active)}>
                        {k.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(k.id)}>Excluir</button>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{keys.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, keys.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{keys.length}</strong> itens
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
                Gerar Nova Chave
              </h3>
            </div>
            
            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Nome do Parceiro</label>
                  <input type="text" className="adm-input" value={form.partner_name} onChange={e => setForm({ ...form, partner_name: e.target.value })} placeholder="Ex: Zapier" />
                </div>
                <div className="adm-field">
                  <label>E-mail do Responsável</label>
                  <input type="email" className="adm-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="dev@exemplo.com" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Ambiente</label>
                  <select className="adm-select" value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })}>
                    <option value="production">Produção</option>
                    <option value="sandbox">Sandbox (Testes)</option>
                  </select>
                  {form.environment === 'sandbox' && (
                    <small style={{ color: 'var(--adm-text-muted)', display: 'block', marginTop: '4px' }}>
                      Lê dados reais de produção (não existe banco de sandbox separado), mas não pode escrever — write_ads é bloqueado pra chaves sandbox.
                    </small>
                  )}
                </div>
                <div className="adm-field">
                  <label>Rate Limit (req/min)</label>
                  <input type="number" className="adm-input" value={form.rate_limit} onChange={e => setForm({ ...form, rate_limit: parseInt(e.target.value) })} />
                </div>
              </div>

              <div className="adm-field">
                <label>Permissões</label>
                <select className="adm-select" multiple size={3} value={form.permissions} onChange={e => setForm({ ...form, permissions: Array.from(e.target.selectedOptions, option => option.value) })} style={{ height: 'auto', padding: '8px' }}>
                  <option value="read_ads">Leitura de Anúncios</option>
                  <option value="write_ads">Escrita de Anúncios</option>
                  <option value="read_users">Leitura de Usuários</option>
                  <option value="full_access">Acesso Total (Admin)</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>Segure Ctrl (ou Cmd) para selecionar múltiplas permissões.</p>
              </div>
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Gerar Chave</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Token Reveal Modal (shown ONCE after key creation) ─── */}
      {newToken && (
        <div className="adm-overlay" style={{ display: 'flex' }}>
          <div className="adm-modal" style={{ maxWidth: '560px', width: '100%', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--adm-text)' }}>Chave Gerada com Sucesso!</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--adm-text-muted)', marginTop: '2px' }}>Copie agora. Este token <strong>não será exibido novamente</strong>.</p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 32px' }}>
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5 }}>
                  Por segurança, apenas o <strong>hash SHA-256</strong> deste token foi salvo no banco de dados. Após fechar esta janela, o token original não poderá ser recuperado.
                </p>
              </div>

              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--adm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Seu Token de Acesso</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                <code style={{
                  flex: 1,
                  display: 'block',
                  background: 'var(--adm-surface-2)',
                  border: '1px solid var(--adm-border)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  color: 'var(--adm-text)',
                  wordBreak: 'break-all',
                  lineHeight: 1.6
                }}>
                  {newToken}
                </code>
                <button
                  className="adm-btn adm-btn--primary"
                  style={{ flexShrink: 0, alignSelf: 'stretch', padding: '0 18px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(newToken)
                    showToast('Token copiado para a área de transferência!', 'success')
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', display: 'flex', justifyContent: 'flex-end', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button
                className="adm-btn adm-btn--primary"
                onClick={() => {
                  setNewToken(null)
                  showToast('Chave criada e ativada com sucesso!', 'success')
                }}
              >
                Entendido, fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
