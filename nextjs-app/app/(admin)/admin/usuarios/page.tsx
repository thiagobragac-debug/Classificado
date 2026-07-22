'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminUsuarios() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos os status')
  const [countryFilter, setCountryFilter] = useState('Todos os países')
  const [planFilter, setPlanFilter] = useState('Todos os planos')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (!error && data) {
      setUsers(data)
    }
    setLoading(false)
  }

  const handleBlockToggle = async (userId: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const newStatus = !currentStatus
    const { error } = await supabase.from('profiles').update({ is_blocked: newStatus }).eq('id', userId)
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, is_blocked: newStatus } : u))
      // Aqui a gente pode chamar a lib do toast, mas como nao temos, uso um alert customizado ou confio no layout
      alert(`Usuário ${newStatus ? 'bloqueado' : 'desbloqueado'} com sucesso!`)
    } else {
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const handleVerifyToggle = async (userId: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const newStatus = !currentStatus
    const { error } = await supabase.from('profiles').update({ verified: newStatus }).eq('id', userId)
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, verified: newStatus } : u))
      alert(`Usuário marcado como ${newStatus ? 'Verificado' : 'Não Verificado'}!`)
    } else {
      alert('Erro ao alterar selo de verificação: ' + error.message)
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

  // KPIs
  const total = users.length
  const blocked = users.filter(u => u.is_blocked).length
  const premium = users.filter(u => u.plan === 'Premium').length
  const pro = users.filter(u => u.plan === 'Pro').length
  const free = total - premium - pro

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gerenciar Usuários</h1>
          <p className="adm-page-sub">Verifique, bloqueie e gerencie os usuários do portal.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="adm-btn adm-btn--outline" onClick={handleExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
          <button className="adm-btn adm-btn--primary" onClick={() => alert('Convite em breve')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Convidar Usuário
          </button>
        </div>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card"><div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total</div></div><div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div></div>
        <div className="adm-stat-card"><div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{premium}</div><div className="adm-stat-lbl">Premium</div></div><div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div></div>
        <div className="adm-stat-card"><div><div className="adm-stat-val" style={{ color: 'var(--adm-blue)' }}>{pro}</div><div className="adm-stat-lbl">Pro</div></div><div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div></div>
        <div className="adm-stat-card"><div><div className="adm-stat-val">{free}</div><div className="adm-stat-lbl">Grátis</div></div><div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div></div>
        <div className="adm-stat-card"><div><div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{blocked}</div><div className="adm-stat-lbl">Bloqueados</div></div><div className="adm-stat-icon adm-stat-icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div></div>
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
                <th style={{ width: '40px' }}><input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} /></th>
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
              ) : filteredUsers.map(user => {
                const plan = user.plan || 'Grátis'
                return (
                  <tr key={user.id}>
                    <td><input type="checkbox" style={{ accentColor: 'var(--adm-accent)' }} /></td>
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
                          <div style={{ fontWeight: 600 }}>{user.name || 'Sem nome'}</div>
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
      </div>
    </>
  )
}
