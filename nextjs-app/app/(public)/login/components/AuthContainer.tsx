'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { ResetPasswordForm } from './ResetPasswordForm'
import { useLang } from '@/lib/lang-context'
import { getSupabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'

type AuthMode = 'login' | 'register' | 'forgot_password' | 'reset_password'

// Mensagens exclusivas deste componente (sem equivalente no dicionário
// global I18N) — padrão local de TRANSLATIONS, igual components/ads/AdsSidebar.tsx.
const TRANSLATIONS = {
  pt: {
    accountBlocked: 'Sua conta foi suspensa temporariamente. Entre em contato com o suporte para mais informações.',
    recoverySessionBlocked: 'Este link é só para redefinir sua senha. Faça login normalmente para acessar sua conta.',
  },
  es: {
    accountBlocked: 'Tu cuenta fue suspendida temporalmente. Contacta al soporte para más información.',
    recoverySessionBlocked: 'Este enlace es solo para restablecer tu contraseña. Inicia sesión normalmente para acceder a tu cuenta.',
  },
} as const

export function AuthContainer() {
  const searchParams = useSearchParams()
  const { t, lang } = useLang()
  const tr = TRANSLATIONS[lang]

  const [mode, setMode] = useState<AuthMode>('login')
  const [alertInfo, setAlertInfo] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [forgotEmail, setForgotEmail] = useState('')

  useEffect(() => {
    if (searchParams.get('mode') === 'register') {
      setMode('register')
    }

    if (searchParams.get('error') === 'blocked') {
      setAlertInfo({ msg: tr.accountBlocked, type: 'error' })
      // Tentar limpar a sessão via cliente também, para segurança extra
      getSupabase().auth.signOut();
    }

    // BUG CORRIGIDO (validação adversarial final, achado crítico): proxy.ts
    // agora barra e derruba sessões de recuperação de senha que tentam
    // acessar /painel ou /admin, mandando de volta pra cá com este
    // parâmetro — sem essa mensagem, o usuário só via a tela de login
    // normal sem entender por que foi "deslogado" ao tentar acessar a conta
    // direto pelo link do e-mail.
    if (searchParams.get('error') === 'recovery_session') {
      setAlertInfo({ msg: tr.recoverySessionBlocked, type: 'error' })
    }
  }, [searchParams, tr])

  // BUG CORRIGIDO (feature aprovada pelo usuário): `?mode=reset` só
  // acionava uma mensagem de sucesso fixa admitindo que a UI pra trocar a
  // senha não existia ("implementação pendente na UI para token") — o link
  // do e-mail de recuperação levava a usuária de volta pro login normal,
  // sem nenhum jeito de realmente definir a senha nova. O evento
  // PASSWORD_RECOVERY do Supabase (disparado quando ele detecta e troca o
  // código de recuperação da URL por uma sessão temporária) é o sinal
  // confiável — a query string por si só não garante que o link era
  // válido/não expirou.
  useEffect(() => {
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset_password')
        setAlertInfo(null)

        // BUG CORRIGIDO (validação adversarial final, achado crítico): o
        // Supabase não marca uma sessão de recuperação de forma distinguível
        // no JWT (testado ao vivo: amr vem como [{"method":"otp"}], igual
        // qualquer outro fluxo de OTP) — sem isso, essa sessão dá acesso
        // total à conta via /painel, sem nunca precisar trocar a senha.
        // Marca explicitamente esta sessão (pelo session_id do próprio JWT)
        // em pending_password_recovery; proxy.ts bloqueia /painel e /admin
        // enquanto essa marcação existir. ResetPasswordForm.tsx apaga a
        // linha ao trocar a senha com sucesso.
        try {
          const payload = JSON.parse(atob(session?.access_token?.split('.')[1] || ''))
          const sessionId = payload?.session_id
          if (sessionId && session?.user?.id) {
            getSupabase().from('pending_password_recovery').insert({ session_id: sessionId, user_id: session.user.id }).then(() => {})
          }
        } catch (e) {
          console.error('[AuthContainer] Falha ao marcar sessão de recuperação:', e)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSetAlert = (msg: string, type: 'success' | 'error') => {
    if (!msg) {
      setAlertInfo(null)
    } else {
      setAlertInfo({ msg, type })
    }
  }

  const navigateToForgot = (email: string) => {
    setForgotEmail(email)
    setMode('forgot_password')
    setAlertInfo(null)
  }

  return (
    <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
      {mode !== 'forgot_password' && mode !== 'reset_password' && (
        <div className="auth-toggle">
          <button className={`toggle-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setAlertInfo(null); }}>
            {t('nav_login')}
          </button>
          <button className={`toggle-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setAlertInfo(null); }}>
            {t('auth_register_btn')}
          </button>
        </div>
      )}

      {alertInfo && (
        <div 
          role="alert"
          aria-live="assertive"
          style={{ 
            padding: '1rem', 
            marginBottom: '1rem', 
            borderRadius: 8, 
            fontSize: '0.9rem', 
            background: alertInfo.type === 'error' ? '#fef2f2' : '#f0fdf4', 
            color: alertInfo.type === 'error' ? '#dc2626' : '#16a34a', 
            border: alertInfo.type === 'error' ? '1px solid #fecaca' : '1px solid #bbf7d0' 
          }}
        >
          {alertInfo.msg}
        </div>
      )}

      <AnimatePresence mode="wait">
        {mode === 'login' && (
          <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <LoginForm 
              onSetAlert={handleSetAlert} 
              onNavigateToForgot={navigateToForgot} 
            />
          </motion.div>
        )}

        {mode === 'register' && (
          <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            <RegisterForm 
              onSetAlert={handleSetAlert} 
              onSuccess={() => setMode('login')} 
            />
          </motion.div>
        )}

        {mode === 'forgot_password' && (
          <motion.div key="forgot" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}>
            <ForgotPasswordForm
              onSetAlert={handleSetAlert}
              onBack={() => { setMode('login'); setAlertInfo(null); }}
              initialEmail={forgotEmail}
            />
          </motion.div>
        )}

        {mode === 'reset_password' && (
          <motion.div key="reset" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}>
            <ResetPasswordForm
              onSetAlert={handleSetAlert}
              onSuccess={() => setMode('login')}
              onBack={() => {
                // BUG CORRIGIDO (validação adversarial final): sair desta
                // tela sem completar a troca de senha deveria encerrar a
                // sessão de recuperação (mesma postura de segurança do
                // bloqueio em proxy.ts) — não deixar uma sessão de
                // recuperação sem uso pendurada só porque a pessoa desistiu
                // do formulário em vez de fechar a aba.
                getSupabase().auth.signOut()
                setMode('login')
                setAlertInfo(null)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
