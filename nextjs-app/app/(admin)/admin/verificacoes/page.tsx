'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminVerificacoes() {
  const [verifications, setVerifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [selectedVerif, setSelectedVerif] = useState<any>(null)
  const [adminNotes, setAdminNotes] = useState('')

  useEffect(() => {
    loadVerifications()
  }, [])

  async function loadVerifications() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('user_verifications')
      .select('*, profiles!user_id(name)')
      .order('submitted_at', { ascending: false })
    
    if (!error && data) {
      setVerifications(data)
    }
    setLoading(false)
  }

  const handleUpdateStatus = async (status: string) => {
    if (!selectedVerif) return

    const supabase = getSupabase()
    
    // 1. Update verification
    const { error } = await supabase.from('user_verifications').update({ 
      status, 
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString()
    }).eq('id', selectedVerif.id)

    if (error) {
      alert('Erro ao atualizar: ' + error.message)
      return
    }

    // 2. Also update the user's kyc_status in profiles
    const { error: profileErr } = await supabase.from('profiles').update({
      kyc_status: status,
      verified: status === 'approved'
    }).eq('id', selectedVerif.user_id)

    if (profileErr) {
      console.error('Failed to update profile kyc_status', profileErr)
    }

    setVerifications(verifications.map(v => v.id === selectedVerif.id ? { ...v, status, admin_notes: adminNotes } : v))
    setSelectedVerif(null)
    setAdminNotes('')
    alert(`Verificação ${status === 'approved' ? 'aprovada' : 'rejeitada'}!`)
  }

  const openModal = (v: any) => {
    setSelectedVerif(v)
    setAdminNotes(v.admin_notes || '')
  }

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Solicitações de Verificação</h1>
        <p className="adm-page-sub">Aprove ou rejeite os pedidos de Selo de Vendedor Verificado enviados pelos usuários.</p>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Usuário</th>
                <th>Tipo</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--adm-text-muted)' }}>Carregando verificações...</td></tr>
              ) : verifications.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Nenhuma solicitação encontrada.</td></tr>
              ) : verifications.map(v => (
                <tr key={v.id}>
                  <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem' }}>{new Date(v.submitted_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 600 }}>{v.profiles?.name || 'Desconhecido'}</td>
                  <td>{v.type || 'Identidade'}</td>
                  <td>
                    {v.status === 'pending' && <span className="adm-badge adm-badge--amber">Pendente</span>}
                    {v.status === 'approved' && <span className="adm-badge adm-badge--featured">Aprovado</span>}
                    {v.status === 'rejected' && <span className="adm-badge" style={{ background: 'var(--adm-red)', color: 'white' }}>Rejeitado</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => openModal(v)}>Analisar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVerif && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && setSelectedVerif(null)}>
          <div className="adm-modal" style={{ maxWidth: '700px', width: '100%' }}>
            <h3 className="adm-modal-title">🛡️ Analisar Verificação</h3>
            
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: 'var(--adm-surface-2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ flex: 1 }}><strong>Usuário:</strong> <span>{selectedVerif.profiles?.name}</span></div>
              <div style={{ flex: 1 }}><strong>Tipo:</strong> <span>{selectedVerif.type || 'Identidade'}</span></div>
              <div style={{ flex: 1 }}><strong>Enviado em:</strong> <span>{new Date(selectedVerif.submitted_at).toLocaleDateString()}</span></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Documento (RG/CNH/CNPJ)</label>
                <img src={selectedVerif.document_url || 'https://placehold.co/400x300?text=Sem+Documento'} style={{ width: '100%', height: '200px', objectFit: 'contain', background: '#000', borderRadius: '8px', marginTop: '8px' }} alt="Documento" />
                {selectedVerif.document_url && <a href={selectedVerif.document_url} target="_blank" style={{ display: 'block', marginTop: '8px', fontSize: '0.85rem', color: 'var(--adm-primary)' }}>Ver Original</a>}
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Foto (Selfie)</label>
                <img src={selectedVerif.selfie_url || 'https://placehold.co/400x300?text=Sem+Selfie'} style={{ width: '100%', height: '200px', objectFit: 'contain', background: '#000', borderRadius: '8px', marginTop: '8px' }} alt="Selfie" />
                {selectedVerif.selfie_url && <a href={selectedVerif.selfie_url} target="_blank" style={{ display: 'block', marginTop: '8px', fontSize: '0.85rem', color: 'var(--adm-primary)' }}>Ver Original</a>}
              </div>
            </div>

            <div className="adm-field" style={{ marginTop: '20px' }}>
              <label>Notas do Administrador (Visível para o usuário em caso de rejeição)</label>
              <textarea className="adm-textarea" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Se for rejeitar, explique o motivo..."></textarea>
            </div>

            <div className="adm-modal-footer" style={{ marginTop: '24px', justifyContent: 'space-between' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setSelectedVerif(null)}>Cancelar</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="adm-btn" style={{ background: 'var(--adm-red)', color: 'white', border: 'none' }} onClick={() => handleUpdateStatus('rejected')}>❌ Rejeitar</button>
                <button className="adm-btn adm-btn--primary" onClick={() => handleUpdateStatus('approved')}>✅ Aprovar Selo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
