'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

export default function CheckoutModal({ plan, onClose }: { plan: any, onClose: () => void }) {
  const { session } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Simulação do checkout
    try {
      const res = await fetch('/api/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no pagamento')

      alert('Pagamento aprovado (Simulação)! Assinatura ativada.')
      router.push('/painel')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#ffffff', width: '100%', maxWidth: '500px',
        borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', color: '#1e293b'
      }}>
        <div style={{
          padding: '1.5rem 2rem', borderBottom: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💳</span> Pagamento Seguro
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748b',
            cursor: 'pointer', width: '32px', height: '32px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
          }}>&times;</button>
        </div>

        <div style={{ padding: '2rem' }}>
          <div style={{
            background: '#f1f5f9', padding: '1rem 1.5rem', borderRadius: '12px',
            marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1.1rem' }}>
              Plano {plan.name_pt || plan.name}
            </div>
            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>
              R$ {plan.price}/mês
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#475569' }}>
                Precisamos de alguns dados extras para emitir sua fatura.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Nome Completo</label>
                <input type="text" required style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>CPF/CNPJ</label>
                  <input type="text" required style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Celular</label>
                  <input type="text" required style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
                </div>
              </div>
              <button type="submit" style={{
                width: '100%', padding: '1rem', background: '#10b981', color: '#ffffff',
                border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer'
              }}>
                Continuar para Pagamento
              </button>
            </form>
          ) : (
            <form onSubmit={handleCheckout}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Número do Cartão</label>
                <input type="text" required placeholder="0000 0000 0000 0000" style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Validade (MM/AA)</label>
                  <input type="text" required placeholder="MM/AA" style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>CVC</label>
                  <input type="text" required placeholder="123" style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc' }} />
                </div>
              </div>
              {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '1rem', background: loading ? '#cbd5e1' : '#10b981', color: '#ffffff',
                border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
              }}>
                {loading ? 'Processando...' : 'Confirmar Pagamento'}
              </button>
              <button type="button" onClick={() => setStep(1)} style={{
                width: '100%', padding: '0.5rem', background: 'transparent', color: '#64748b',
                border: 'none', fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem'
              }}>
                Voltar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
