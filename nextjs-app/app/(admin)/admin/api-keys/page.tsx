'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminApiKeys() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
    const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      setKeys(data)
    }
    setLoading(false)
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('api_keys').update({ is_active: !currentStatus }).eq('id', id)
    if (!error) {
      setKeys(keys.map(k => k.id === id ? { ...k, is_active: !currentStatus } : k))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta chave?')) return
    const supabase = getSupabase()
    const { error } = await supabase.from('api_keys').delete().eq('id', id)
    if (!error) {
      setKeys(keys.filter(k => k.id !== id))
    } else {
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const generateSecret = () => {
    return 'tk_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  }

  const handleSave = async () => {
    if (!form.partner_name || !form.email) return alert('Preencha nome do parceiro e e-mail')
    
    const supabase = getSupabase()
    const secret = generateSecret() // Generate a random key

    const payload = {
      ...form,
      secret_hash: secret, // In a real scenario we'd hash this, but we store as is for now to match old code behavior
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('api_keys').insert(payload).select().single()
    if (!error && data) {
      setKeys([data, ...keys])
      setIsModalOpen(false)
      alert(`Chave gerada com sucesso! Copie a chave (ela não será exibida novamente):\n\n${secret}`)
    } else {
      alert('Erro: ' + error?.message)
    }
  }

  const total = keys.length
  const ativos = keys.filter(k => k.is_active).length

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Chaves de API REST</h1>
          <p className="adm-page-sub">Gerencie tokens de acesso para integrações e parceiros.</p>
        </div>
        <button className="adm-btn adm-btn--primary" onClick={() => {
          setForm({ partner_name: '', email: '', permissions: ['read_ads'], environment: 'production', rate_limit: 100, is_active: true })
          setIsModalOpen(true)
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Gerar Nova Chave
        </button>
      </div>

      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: '24px', maxWidth: '500px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Integrações</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativas</div></div>
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
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%' }}>
            <h3 className="adm-modal-title">➕ Gerar Nova Chave</h3>
            
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

            <div className="adm-modal-footer" style={{ marginTop: '24px' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Gerar Chave</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
