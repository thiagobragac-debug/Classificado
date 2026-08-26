'use client'

import React, { useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function SucessoContent() {
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') || 'Pro'

  useEffect(() => {
    // Optional: Refresh session data to reflect new plan immediately
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0F0D', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '2rem',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        maxWidth: '520px', width: '100%', background: 'rgba(15,23,18,0.9)',
        backdropFilter: 'blur(24px)', border: '1px solid rgba(22,163,74,0.2)',
        borderRadius: '24px', padding: '3rem 2.5rem', textAlign: 'center',
        boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(22,163,74,0.1)',
        position: 'relative', zIndex: 1
      }}>
        <div style={{
          width: '90px', height: '90px', borderRadius: '50%',
          background: 'linear-gradient(135deg,#16A34A,#15803D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 2rem',
          boxShadow: '0 0 0 16px rgba(22,163,74,0.08), 0 0 0 32px rgba(22,163,74,0.04)'
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        {/* BUG CORRIGIDO (validação de 2026-08-26): esta tela é 100%
            client-side, sem nenhuma checagem de sessão/servidor — quem
            acessasse a URL direto (bookmark, back/forward, link
            compartilhado) via "Pagamento Aprovado! Plano ativado" mesmo
            sem ter pago nada. Quem realmente ativa o plano é o webhook
            (assíncrono); a mensagem agora não afirma um estado que esta
            página não tem como confirmar. */}
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginBottom: '0.75rem' }}>Pagamento recebido!</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
          Estamos confirmando sua assinatura — isso leva só alguns instantes. Se os novos limites não aparecerem no seu painel em pouco tempo, contate o suporte.
        </p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)',
          color: '#4ADE80', padding: '0.5rem 1.25rem', borderRadius: '2rem',
          fontWeight: 700, fontSize: '0.95rem', marginBottom: '2rem'
        }}>
          Plano {plan} — confirmando
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Link href="/anunciar" style={{
            padding: '0.85rem 1.5rem', background: 'linear-gradient(135deg,#16A34A,#15803D)',
            border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem',
            fontWeight: 700, textDecoration: 'none', display: 'block'
          }}>
            Criar meu primeiro Anúncio
          </Link>
          <Link href="/painel" style={{
            padding: '0.85rem 1.5rem', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
            color: '#fff', fontSize: '1rem', fontWeight: 600,
            textDecoration: 'none', display: 'block'
          }}>
            Ir para o Painel
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function SucessoPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <SucessoContent />
    </Suspense>
  )
}
