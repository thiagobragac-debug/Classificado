'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CanceladoPage() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0F0D', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '2rem',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        maxWidth: '520px', width: '100%', background: 'rgba(15,23,18,0.9)',
        backdropFilter: 'blur(24px)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '24px', padding: '3rem 2.5rem', textAlign: 'center',
        boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.1)',
        position: 'relative', zIndex: 1
      }}>
        <div style={{
          width: '90px', height: '90px', borderRadius: '50%',
          background: 'linear-gradient(135deg,#ef4444,#dc2626)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 2rem',
          boxShadow: '0 0 0 16px rgba(239,68,68,0.08), 0 0 0 32px rgba(239,68,68,0.04)'
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>

        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginBottom: '0.75rem' }}>Pagamento Cancelado</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
          Houve um problema ao processar seu pagamento ou você cancelou a operação. Nenhuma cobrança foi efetuada.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={() => router.back()} style={{
            padding: '0.85rem 1.5rem', background: 'linear-gradient(135deg,#ef4444,#dc2626)',
            border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem',
            fontWeight: 700, cursor: 'pointer'
          }}>
            Tentar Novamente
          </button>
          <Link href="/planos" style={{
            padding: '0.85rem 1.5rem', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
            color: '#fff', fontSize: '1rem', fontWeight: 600,
            textDecoration: 'none', display: 'block'
          }}>
            Ver Planos
          </Link>
        </div>
      </div>
    </div>
  )
}
