import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { resetPassword } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'

interface ForgotPasswordFormProps {
  onSetAlert: (msg: string, type: 'success' | 'error') => void
  onBack: () => void
  initialEmail?: string
}

// Mensagens de toast/resultado de submissão exclusivas deste formulário —
// padrão local de TRANSLATIONS (os labels de campo já usam o dicionário
// global I18N via t()).
const TRANSLATIONS = {
  pt: {
    successSent: 'E-mail de redefinição enviado com sucesso. Verifique sua caixa de entrada.',
    sendError: 'Erro ao enviar e-mail de redefinição.',
  },
  es: {
    successSent: 'Correo de restablecimiento enviado con éxito. Revisa tu bandeja de entrada.',
    sendError: 'Error al enviar el correo de restablecimiento.',
  },
} as const

export function ForgotPasswordForm({ onSetAlert, onBack, initialEmail = '' }: ForgotPasswordFormProps) {
  const { t, lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [loading, setLoading] = useState(false)

  const forgotSchema = useMemo(() => z.object({
    email: z.string().email(t('err_email'))
  }), [t])

  type ForgotData = z.infer<typeof forgotSchema>

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: initialEmail }
  })

  const onSubmit = async (data: ForgotData) => {
    onSetAlert('', 'success')
    setLoading(true)
    try {
      await resetPassword(data.email)
      onSetAlert(tr.successSent, 'success')
    } catch (err: any) {
      onSetAlert(err.message || tr.sendError, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--clr-text)' }}>{t('auth_forgot_title')}</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--clr-text-muted)' }}>
          {t('auth_forgot_desc')}
        </p>
      </div>

      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="forgot-email" className="form-label">{t('auth_email')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          <input 
            id="forgot-email"
            type="email" 
            className={`form-input ${errors.email ? 'is-invalid' : ''}`} 
            placeholder={t('auth_email_ph')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "forgot-email-error" : undefined}
            {...register('email')} 
          />
        </div>
        {errors.email && <span id="forgot-email-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.email.message}</span>}
      </div>

      <button type="submit" className="btn btn--accent btn--lg" style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }} disabled={loading}>
        {loading ? t('auth_forgot_ing') : t('auth_forgot_btn')}
      </button>

      <div style={{ textAlign: 'center' }}>
        <button 
          type="button" 
          onClick={onBack} 
          style={{ background: 'none', border: 'none', color: 'var(--clr-text-muted)', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
        >
          {t('auth_back_login')}
        </button>
      </div>
    </form>
  )
}
