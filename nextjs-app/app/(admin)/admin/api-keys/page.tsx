'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// BUG CORRIGIDO (achado de usabilidade): o seletor de permissões era um
// <select multiple> nativo — exige Ctrl/Cmd+clique para marcar mais de uma
// opção (pouco descoberto no desktop) e é inviável em touch/tablet (não há
// como fazer "ctrl+clique" num toque). Vira uma lista de checkboxes, uma por
// permissão, mantendo o mesmo array `form.permissions`.
const PERMISSIONS = [
  { value: 'read_ads', label: 'Leitura de Anúncios' },
  { value: 'write_ads', label: 'Escrita de Anúncios' },
  { value: 'read_users', label: 'Leitura de Usuários' },
  { value: 'full_access', label: 'Acesso Total (Admin)' },
]

export default function AdminApiKeys() {
  const { confirm } = useConfirm()
  const [keys, setKeys] = useState<any[]>([])
  const [newToken, setNewToken] = useState<string | null>(null) // Token shown once after creation
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 1.500 chaves de uma vez e paginava
  // em memória. Agora a paginação roda de verdade no servidor via .range(),
  // e os KPIs vêm de contagens globais separadas, não do array já paginado.
  const [totalKeys, setTotalKeys] = useState(0)
  const [counts, setCounts] = useState({ ativos: 0, revogadas: 0, hoje: 0 })

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): o formulário nunca
  // enviava expires_at, então toda chave nascia com expiração nula — perpétua
  // na prática, mesmo a coluna e a checagem de expiração já existindo
  // (lib/api-auth.ts) e havendo uma Edge Function dedicada a avisar sobre
  // chaves expirando. Padrão de 12 meses; o admin pode limpar o campo pra
  // criar uma chave sem expiração, mas isso deixa de ser o padrão silencioso.
  // Valida uma data "AAAA-MM-DD" (de <input type="date"> ou de window.prompt)
  // e devolve o ISO string persistível (23:59:59 local) ou null (sem
  // expiração) — compartilhada entre handleSave e handleRenew.
  //
  // BUG CORRIGIDO (re-auditoria, 2026-08-30): a validação original de
  // handleRenew comparava Date.parse() sobre o texto CRU do prompt, mas o
  // valor de fato persistido é `${data}T23:59:59` — o parser "legado" do V8
  // aceita formatos (com espaço, por extenso, sem zero à esquerda) que a
  // string combinada não aceita, então uma entrada "válida" na checagem
  // virava `Invalid time value` no `.toISOString()` seguinte (exceção não
  // tratada, tela travava sem nenhum toast). Regex estrita primeiro, e a
  // validação roda sobre o MESMO valor que será gravado.
  //
  // BUG CORRIGIDO (re-auditoria, 2026-08-30): comparar de volta com
  // `toISOString().slice(0,10)` (UTC) rejeitaria datas locais válidas em
  // qualquer fuso atrás de UTC (Brasil incluso — 30/08 23:59:59 local vira
  // 31/08 de madrugada em UTC). Usa getters locais (getFullYear/getMonth/
  // getDate), que também pegam data de calendário inexistente (ex:
  // 2026-02-30 rola silenciosamente pra 03/03 — a comparação de volta
  // detecta isso sem precisar de lib de datas).
  //
  // `handleSave` não tinha essa blindagem (só o <input type="date"> nativo
  // impedia valor malformado na prática) — extraído aqui pra cobrir os dois
  // lugares com a mesma garantia.
  const parseExpiresAtInput = (dateStr: string): { valor: string | null; erro?: string } => {
    if (dateStr === '') return { valor: null }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { valor: null, erro: 'Data inválida. Use o formato AAAA-MM-DD.' }
    }
    const [ano, mes, dia] = dateStr.split('-').map(Number)
    const dataCompleta = new Date(`${dateStr}T23:59:59`)
    if (
      Number.isNaN(dataCompleta.getTime()) ||
      dataCompleta.getFullYear() !== ano ||
      dataCompleta.getMonth() + 1 !== mes ||
      dataCompleta.getDate() !== dia
    ) {
      return { valor: null, erro: 'Data inválida — confira o dia informado.' }
    }
    return { valor: dataCompleta.toISOString() }
  }

  const defaultExpiresAt = () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  }

  const [form, setForm] = useState({
    partner_name: '',
    email: '',
    permissions: ['read_ads'],
    environment: 'production',
    rate_limit: 100,
    is_active: true,
    expires_at: defaultExpiresAt()
  })

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadKeys()
  }, [currentPage])

  async function loadKeys() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): select('*') incluía
    // secret_hash na resposta pro navegador do admin — não reversível (SHA-256
    // de 256 bits), mas exposição desnecessária de um dado sensível a
    // qualquer coisa que intercepte o tráfego do painel (extensão, proxy de
    // debug). Lista explícita de colunas em vez de '*'.
    const { data, count, error } = await supabase
      .from('api_keys')
      .select('id, partner_name, email, permissions, environment, rate_limit, is_active, expires_at, created_at, last_used_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (!error && data) {
      setKeys(data)
      if (count !== null) setTotalKeys(count)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhuma chave gerada"
      // sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar chaves: ' + error.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [r1, r2, r3] = await Promise.all([
      supabase.from('api_keys').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('api_keys').select('*', { count: 'exact', head: true }).eq('is_active', false),
      supabase.from('api_keys').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    ])
    const firstError = [r1, r2, r3].find(r => r.error)?.error
    if (firstError) showToast('Erro ao carregar contadores: ' + firstError.message, 'error')
    setCounts({ ativos: r1.count || 0, revogadas: r2.count || 0, hoje: r3.count || 0 })
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('api_keys').update({ is_active: !currentStatus }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setKeys(keys.map(k => k.id === id ? { ...k, is_active: !currentStatus } : k))
      loadCounts()
    } else if (!error) {
      showToast('Nenhuma linha foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const handleRenew = async (id: string, partnerName: string) => {
    // Ação simples de renovação (auditoria de segurança, 2026-08-30) — não há
    // tela de edição pra chaves existentes, então pede só a nova data em vez
    // de reabrir o modal inteiro de criação.
    const novaData = window.prompt(
      `Nova data de expiração para "${partnerName}" (formato AAAA-MM-DD). Deixe em branco para remover a expiração.`,
      defaultExpiresAt()
    )
    if (novaData === null) return // cancelado

    const { valor: novoValor, erro } = parseExpiresAtInput(novaData)
    if (erro) {
      showToast(erro, 'error')
      return
    }

    const supabase = getSupabase()
    // BUG CORRIGIDO (re-auditoria, 2026-08-30): sem .select(), o PostgREST
    // devolve sucesso mesmo com 0 linhas afetadas (RLS bloqueou, ou o
    // registro já não existe) — mesma classe de bug já corrigida em
    // handleToggleStatus/handleDelete, que faltava aqui.
    const { data, error } = await supabase.from('api_keys').update({ expires_at: novoValor }).eq('id', id).select()
    if (error) {
      showToast('Erro ao renovar: ' + error.message, 'error')
      return
    }
    if (!data || data.length === 0) {
      showToast('Nenhuma chave foi atualizada — verifique permissões ou se o registro ainda existe.', 'error')
      return
    }
    setKeys(keys.map(k => k.id === id ? { ...k, expires_at: novoValor } : k))
    showToast('Expiração atualizada.', 'success')
  }

  const handleDelete = async (id: string) => {
    // BUG CORRIGIDO (achado de usabilidade): o confirm() era genérico e
    // idêntico pra qualquer linha — sem o nome do parceiro, o admin não
    // tinha como confirmar visualmente que ia excluir a chave certa.
    const chave = keys.find(k => k.id === id)
    const nomeParceiro = chave?.partner_name || 'esta chave'
    if (!(await confirm(`Deseja realmente excluir a chave do parceiro "${nomeParceiro}"? Essa ação não pode ser desfeita.`))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('api_keys').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      // Excluir pode deixar a página atual com menos itens que o esperado
      // — recarrega de verdade em vez de só remover localmente.
      loadKeys()
      loadCounts()
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

    // BUG CORRIGIDO (re-auditoria, 2026-08-30): handleSave não tinha a mesma
    // blindagem de data de handleRenew — na prática o <input type="date">
    // nativo já impede valor malformado, mas por consistência (e por não
    // depender só do browser se algum dia o campo mudar de tipo) usa a
    // mesma validação compartilhada.
    const { valor: expiresAt, erro: erroData } = parseExpiresAtInput(form.expires_at)
    if (erroData) return showToast(erroData, 'error')

    const supabase = getSupabase()
    const secret = generateSecret()        // Raw token — shown to admin ONCE, never stored
    const secretHash = await hashSecret(secret) // SHA-256 hash — stored in DB

    const payload = {
      ...form,
      expires_at: expiresAt,
      secret_hash: secretHash,             // ✅ Only the hash persists
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('api_keys').insert(payload).select().single()
    if (!error && data) {
      setIsModalOpen(false)
      setNewToken(secret) // Show raw token once in dedicated modal
      // Uma chave nova entra no topo (created_at desc) — só aparece na
      // página 1; recarrega de verdade em vez de inserir otimisticamente
      // numa página que pode não ser a atual.
      if (currentPage !== 1) setCurrentPage(1)
      else loadKeys()
      loadCounts()
    } else {
      showToast('Erro: ' + error?.message, 'error')
    }
  }

  // KPIs: globais, vindos de loadCounts() — não dependem da página atual
  const { ativos, revogadas, hoje } = counts
  const total = totalKeys

  const totalPages = Math.ceil(totalKeys / pageSize)

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
            setForm({ partner_name: '', email: '', permissions: ['read_ads'], environment: 'production', rate_limit: 100, is_active: true, expires_at: defaultExpiresAt() })
            setIsModalOpen(true)
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Gerar Nova Chave
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ marginBottom: '24px' }}>
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
                <th>Expira em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>Carregando chaves...</td></tr>
              ) : keys.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>Nenhuma chave gerada ainda.</td></tr>
              ) : keys.map(k => (
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
                  <td style={{ fontSize: '0.85rem' }}>
                    {k.expires_at ? (
                      <span style={{ color: new Date(k.expires_at) < new Date() ? 'var(--adm-red)' : 'var(--adm-text-muted)' }}>
                        {new Date(k.expires_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="adm-badge adm-badge--amber">Nunca</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleRenew(k.id, k.partner_name)}>Renovar</button>
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
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalKeys === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalKeys)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalKeys}</strong> itens
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
                  <input type="number" min={0} className="adm-input" value={form.rate_limit} onChange={e => { const n = parseInt(e.target.value); setForm({ ...form, rate_limit: isNaN(n) ? 0 : Math.max(0, n) }) }} />
                </div>
              </div>

              <div className="adm-field">
                <label>Expira em</label>
                <input type="date" className="adm-input" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                <small style={{ color: 'var(--adm-text-muted)', display: 'block', marginTop: '4px' }}>
                  Deixe em branco para uma chave sem expiração (não recomendado — parceiros que encerram o contrato continuam com acesso válido indefinidamente).
                </small>
              </div>

              <div className="adm-field">
                <label>Permissões</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--adm-border)', borderRadius: '8px', padding: '12px 14px' }}>
                  {PERMISSIONS.map(perm => (
                    <label key={perm.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', color: 'var(--adm-text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(perm.value)}
                        onChange={e => {
                          const checked = e.target.checked
                          setForm(f => ({
                            ...f,
                            permissions: checked
                              ? [...f.permissions, perm.value]
                              : f.permissions.filter(v => v !== perm.value),
                          }))
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {perm.label}
                    </label>
                  ))}
                </div>
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
