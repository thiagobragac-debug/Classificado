'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLang } from '@/lib/lang-context'

// BUG CORRIGIDO (auditoria de usabilidade): o nome da rota ("/reset") é
// idêntico ao que qualquer usuário esperaria de uma recuperação de senha de
// verdade, mas esta página só limpa localStorage/sessionStorage do
// navegador e redireciona — sem nenhum texto explicando isso, quem chegasse
// aqui por engano (ou com o redirect automático falhando por algum motivo)
// ficava sem entender o que estava acontecendo e sem saída manual.
const TRANSLATIONS = {
  pt: {
    clearing: 'Limpando cache e redirecionando...',
    explanation: 'Esta página não redefine senha de conta — ela apenas limpa dados salvos localmente no seu navegador. Você será redirecionado para a página inicial em instantes.',
    goHome: 'Ir para a página inicial agora',
  },
  es: {
    clearing: 'Limpiando caché y redirigiendo...',
    explanation: 'Esta página no restablece la contraseña de tu cuenta — solo limpia datos guardados localmente en tu navegador. Serás redirigido a la página de inicio en instantes.',
    goHome: 'Ir a la página de inicio ahora',
  },
} as const

export default function ResetPage() {
  const router = useRouter()
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]

  useEffect(() => {
    // Clear caches
    try { localStorage.removeItem('user_loc_v3'); } catch(_) {}
    const statsKeys = ['tc_platform_stats_v4','tc_platform_stats_v3','tc_platform_stats_v2','tc_platform_stats'];
    statsKeys.forEach(k => { try { sessionStorage.removeItem(k); } catch(_) {} });
    
    // Redirect after a short delay
    const timer = setTimeout(() => {
      router.push('/')
    }, 800)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div style={{
      fontFamily: 'sans-serif', background: '#0f172a', color: '#e2e8f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', margin: 0, flexDirection: 'column', gap: '16px'
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />
      <div style={{
        width: '40px', height: '40px', border: '3px solid #334155',
        borderTopColor: '#22c55e', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}></div>
      <div style={{ color: '#22c55e', fontSize: '1.2rem' }}>
        {tr.clearing}
      </div>
      <p style={{ maxWidth: 380, textAlign: 'center', fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>
        {tr.explanation}
      </p>
      <Link href="/" style={{ color: '#22c55e', fontSize: '0.9rem', textDecoration: 'underline' }}>
        {tr.goHome}
      </Link>
    </div>
  )
}
