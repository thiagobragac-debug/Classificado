'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminUsuarios() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos os status')
  const [countryFilter, setCountryFilter] = useState('Todos os países')
  const [planFilter, setPlanFilter] = useState('Todos os planos')

  // Modals state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const [selectedUserForDetails, setSelectedUserForDetails] = useState<any>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*, user_secrets(is_blocked, plan, email), ads(count)')
      .order('created_at', { ascending: false })
      .limit(1500)
    
    if (!error && data) {
      const mapped = data.map((u: any) => ({
        ...u,
        is_blocked: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.is_blocked : u.user_secrets?.is_blocked,
        plan: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.plan : u.user_secrets?.plan,
        email: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.email : u.user_secrets?.email,
        ads_count: Array.isArray(u.ads) ? u.ads[0]?.count : (u.ads?.count || 0)
      }))
      setUsers(mapped)
    }
    setLoading(false)
  }

  // is_blocked é coluna privilegiada: só o service_role escreve nela, e o
  // bloqueio precisa banir o usuário no Auth para derrubar a sessão ativa.
  // Por isso passa pela rota de servidor em vez do client do browser.
  const setBlocked = async (userIds: string[], blocked: boolean) => {
    const res = await fetch('/api/admin/block-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, blocked }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || 'Falha ao alterar status')
    return payload
  }

  const handleBlockToggle = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus
    try {
      await setBlocked([userId], newStatus)
      setUsers(users.map(u => u.id === userId ? { ...u, is_blocked: newStatus } : u))
      showToast(`Usuário ${newStatus ? 'bloqueado' : 'desbloqueado'} com sucesso!`, 'success')
    } catch (err) {
      showToast('Erro ao alterar status: ' + (err as Error).message, 'error')
    }
  }

  const handleVerifyToggle = async (userId: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const newStatus = !currentStatus
    const { error } = await supabase.from('profiles').update({ verified: newStatus }).eq('id', userId)
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, verified: newStatus } : u))
      showToast(`Usuário marcado como ${newStatus ? 'Verificado' : 'Não Verificado'}!`, 'success')
    } else {
      showToast('Erro ao alterar selo de verificação: ' + error.message, 'error')
    }
  }

  const handleExport = () => {
    const headers = ['Nome', 'Email', 'País', 'Plano', 'Status', 'Data Cadastro']
    const rows = filteredUsers.map(u => [
      u.name || '',
      u.email || '',
      u.country || '',
      u.plan || 'Grátis',
      u.is_blocked ? 'Bloqueado' : 'Ativo',
      new Date(u.created_at).toLocaleDateString()
    ])
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "usuarios_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedUsers.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(paginatedUsers.map(u => u.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleBulkBlock = async (shouldBlock: boolean) => {
    if (selectedIds.length === 0) return
    // Escrevia em profiles.is_blocked — coluna removida pela migration
    // 20260723072100_split_user_secrets.sql, ou seja, não bloqueava ninguém.
    try {
      await setBlocked(selectedIds, shouldBlock)
      setUsers(users.map(u => selectedIds.includes(u.id) ? { ...u, is_blocked: shouldBlock } : u))
      showToast(`${selectedIds.length} usuários ${shouldBlock ? 'bloqueados' : 'desbloqueados'}!`, 'success')
      setSelectedIds([])
    } catch (err) {
      showToast('Erro ao atualizar usuários: ' + (err as Error).message, 'error')
    }
  }

  const filteredUsers = users.filter(u => {
    if (search && !(u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))) return false
    if (statusFilter !== 'Todos os status') {
      const isBlocked = !!u.is_blocked;
      if (statusFilter === 'Ativo' && isBlocked) return false
      if (statusFilter === 'Bloqueado' && !isBlocked) return false
    }
    if (countryFilter !== 'Todos os países' && !u.country?.toLowerCase().includes(countryFilter.toLowerCase().replace(/[^\w\s]/g, '').trim())) return false
    if (planFilter !== 'Todos os planos') {
      const p = u.plan || 'Grátis'
      if (p !== planFilter) return false
    }
    return true
  })

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return
    
    setInviting(true)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao convidar')
      
      showToast('Convite enviado com sucesso para ' + inviteEmail, 'success')
      setIsInviteModalOpen(false)
      setInviteEmail('')
      loadUsers()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, countryFilter, planFilter])

  const totalPages = Math.ceil(filteredUsers.length / pageSize)
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // KPIs
  const total = users.length
  const assinantes = users.filter(u => u.plan === 'Premium' || u.plan === 'Pro').length
  const free = total - assinantes
  const blocked = users.filter(u => u.is_blocked).length

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <div>
          <h1 className="adm-page-title" style={{ margin: '0 0 8px 0' }}>Gerenciar Usuários</h1>
          <p className="adm-page-sub" style={{ margin: 0, color: 'var(--adm-text-muted)' }}>Verifique, bloqueie e gerencie os usuários do portal.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="adm-btn adm-btn--outline" onClick={handleExport}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
          <button className="adm-btn adm-btn--primary" onClick={() => setIsInviteModalOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Convidar Usuário
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-blue)' }}>{assinantes}</div><div className="adm-stat-lbl">Assinantes</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{free}</div><div className="adm-stat-lbl">Grátis</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{blocked}</div><div className="adm-stat-lbl">Bloqueados</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-filter-bar">
          <div className="adm-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" className="adm-search-input" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="adm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option>Todos os status</option>
            <option>Ativo</option>
            <option>Bloqueado</option>
          </select>
          <select className="adm-select" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option>Todos os países</option>
            <option>Brasil</option>
            <option>Argentina</option>
            <option>Uruguai</option>
            <option>Paraguai</option>
          </select>
          <select className="adm-select" value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
            <option>Todos os planos</option>
            <option>Premium</option>
            <option>Pro</option>
            <option>Grátis</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} 
                         checked={paginatedUsers.length > 0 && selectedIds.length === paginatedUsers.length}
                         onChange={toggleSelectAll} />
                </th>
                <th>Usuário</th>
                <th>País</th>
                <th>Plano</th>
                <th style={{ textAlign: 'center' }}>Selo</th>
                <th style={{ textAlign: 'center' }}>Anúncios</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>Carregando...</td></tr>
              ) : paginatedUsers.map(user => {
                const plan = user.plan || 'Grátis'
                return (
                  <tr key={user.id}>
                    <td>
                      <input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} 
                             checked={selectedIds.includes(user.id)}
                             onChange={() => toggleSelect(user.id)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--adm-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--adm-text-muted)', fontWeight: 'bold' }}>
                            {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--adm-accent)' }} onClick={() => setSelectedUserForDetails(user)}>{user.name || 'Sem nome'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>{user.email || user.phone_whatsapp || 'Sem contato'}</div>
                        </div>
                      </div>
                    </td>
                    <td>{user.country || '-'}</td>
                    <td>
                      {plan === 'Premium' && <span className="adm-badge adm-badge--featured">⭐ Premium</span>}
                      {plan === 'Pro' && <span className="adm-badge adm-badge--verified">🔷 Pro</span>}
                      {plan === 'Grátis' && <span className="adm-badge" style={{ background: 'var(--adm-surface-3)', color: 'var(--adm-text-muted)' }}>Grátis</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleVerifyToggle(user.id, !!user.verified)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: user.verified ? 1 : 0.3 }}
                        title={user.verified ? "Remover Selo" : "Dar Selo de Verificado"}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2">
                          <polygon points="12 2 15.09 5.09 19.5 5 19.5 9.41 22.59 12.5 19.5 15.59 19.5 20 15.09 19.91 12 23 8.91 19.91 4.5 20 4.5 15.59 1.41 12.5 4.5 9.41 4.5 5 8.91 5.09 12 2"></polygon>
                          <polyline points="9 12.5 11 14.5 15.5 9" stroke="white" strokeWidth="3" fill="none"></polyline>
                        </svg>
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>{user.ads_count || 0}</td>
                    <td>
                      {user.is_blocked ? (
                        <span className="adm-badge adm-badge--red">Bloqueado</span>
                      ) : (
                        <span className="adm-badge adm-badge--green">Ativo</span>
                      )}
                    </td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="adm-btn adm-btn--outline adm-btn--sm" onClick={() => handleBlockToggle(user.id, !!user.is_blocked)}>
                        {user.is_blocked ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* PAGINATION FOOTER */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
            <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{filteredUsers.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, filteredUsers.length)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{filteredUsers.length}</strong> itens
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
            <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => setSelectedIds([])}>Cancelar</button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleBulkBlock(true)}>Bloquear</button>
            <button className="adm-btn adm-btn--sm adm-btn--primary" style={{ background: 'var(--adm-green)', borderColor: 'var(--adm-green)' }} onClick={() => handleBulkBlock(false)}>Desbloquear</button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--adm-surface)', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h2 style={{ margin: '0 0 15px 0' }}>Convidar Usuário</h2>
            <p style={{ color: 'var(--adm-text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>Um e-mail será enviado com um link mágico para o usuário configurar sua conta e senha.</p>
            
            <form onSubmit={handleInviteUser}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>E-mail do Usuário</label>
                <input 
                  type="email" 
                  value={inviteEmail} 
                  onChange={e => setInviteEmail(e.target.value)} 
                  required 
                  autoFocus
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--adm-border)', background: 'var(--adm-bg)', color: 'var(--adm-text)' }} 
                  placeholder="exemplo@email.com"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="adm-btn adm-btn--outline" onClick={() => setIsInviteModalOpen(false)}>Cancelar</button>
                <button type="submit" className="adm-btn adm-btn--primary" disabled={inviting}>
                  {inviting ? 'Enviando...' : 'Enviar Convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUserForDetails && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--adm-surface)', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Detalhes do Cadastro</h2>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--adm-text-muted)' }} onClick={() => setSelectedUserForDetails(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                 {selectedUserForDetails.avatar_url ? (
                    <img src={selectedUserForDetails.avatar_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--adm-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--adm-text-muted)', fontWeight: 'bold', fontSize: '24px' }}>
                      {selectedUserForDetails.name ? selectedUserForDetails.name.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedUserForDetails.name || 'Sem nome'} {selectedUserForDetails.display_name && `(${selectedUserForDetails.display_name})`}</div>
                    <div style={{ color: 'var(--adm-text-muted)' }}>Membro desde {new Date(selectedUserForDetails.created_at).toLocaleDateString()}</div>
                  </div>
              </div>
              
              <div style={{ background: 'var(--adm-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--adm-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Email</div>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {selectedUserForDetails.email || '-'}
                      {selectedUserForDetails.email_verified && <span title="Email Verificado" style={{ color: 'var(--adm-green)', fontSize: '14px' }}>✓</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Telefone / WhatsApp</div>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {selectedUserForDetails.phone_whatsapp || '-'}
                      {selectedUserForDetails.whatsapp_verified && <span title="WhatsApp Verificado" style={{ color: 'var(--adm-green)', fontSize: '14px' }}>✓</span>}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Biografia (Sobre)</div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: selectedUserForDetails.bio ? 'inherit' : 'var(--adm-text-muted)' }}>
                      {selectedUserForDetails.bio || 'Sem biografia informada.'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>ID do Usuário</div>
                    <div style={{ fontWeight: 500, fontSize: '0.8rem', wordBreak: 'break-all' }}>{selectedUserForDetails.id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Localização</div>
                    <div style={{ fontWeight: 500 }}>
                      {[selectedUserForDetails.city, selectedUserForDetails.state, selectedUserForDetails.country].filter(Boolean).join(', ') || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Plano e Assinatura</div>
                    <div style={{ fontWeight: 500 }}>
                      {selectedUserForDetails.plan || 'Grátis'} 
                      {selectedUserForDetails.subscription_status && ` (${selectedUserForDetails.subscription_status})`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Validade do Plano</div>
                    <div style={{ fontWeight: 500 }}>
                      {selectedUserForDetails.plan_expires_at ? new Date(selectedUserForDetails.plan_expires_at).toLocaleDateString() : 'Vitalício / Indeterminado'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Selo KYC (Identidade)</div>
                    <div style={{ fontWeight: 500 }}>
                      {selectedUserForDetails.verified ? <span style={{ color: 'var(--adm-green)' }}>Verificado</span> : <span style={{ color: 'var(--adm-text-muted)' }}>Não verificado</span>}
                      {selectedUserForDetails.kyc_status && ` [${selectedUserForDetails.kyc_status}]`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)' }}>Status da Conta</div>
                    <div style={{ fontWeight: 500 }}>{selectedUserForDetails.is_blocked ? <span style={{ color: 'var(--adm-red)' }}>Bloqueado</span> : <span style={{ color: 'var(--adm-green)' }}>Ativo</span>}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setSelectedUserForDetails(null)}>Fechar Detalhes</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
