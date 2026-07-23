'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { useLang } from '@/lib/lang-context'
import { motion, AnimatePresence } from 'framer-motion'

type AuthMode = 'login' | 'register' | 'forgot_password'

export function AuthContainer() {
  const searchParams = useSearchParams()
  const { t } = useLang()
  
  const [mode, setMode] = useState<AuthMode>('login')
  const [alertInfo, setAlertInfo] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [forgotEmail, setForgotEmail] = useState('')

  useEffect(() => {
    if (searchParams.get('mode') === 'register') {
      setMode('register')
    } else if (searchParams.get('mode') === 'reset') {
      setAlertInfo({ msg: 'Você pode redefinir sua senha agora (implementação pendente na UI para token).', type: 'success' })
    }
  }, [searchParams])

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
      {mode !== 'forgot_password' && (
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
      </AnimatePresence>
    </div>
  )
}
