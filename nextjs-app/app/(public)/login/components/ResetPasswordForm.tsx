import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'

interface ResetPasswordFormProps {
  onSetAlert: (msg: string, type: 'success' | 'error') => void
  onSuccess: () => void
}

// Mensagens/aria-labels exclusivos deste formulário — padrão local de
// TRANSLATIONS (os labels de campo já usam o dicionário global I18N via
// t()), mesmo padrão de RegisterForm.tsx.
const TRANSLATIONS = {
  pt: {
    hidePassword: 'Ocultar senha',
    showPassword: 'Mostrar senha',
  },
  es: {
    hidePassword: 'Ocultar contraseña',
    showPassword: 'Mostrar contraseña',
  },
} as const

export function ResetPasswordForm({ onSetAlert, onSuccess }: ResetPasswordFormProps) {
  const { t, lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const resetSchema = useMemo(() => z.object({
    password: z.string().min(8, t('err_pass_min')),
    confirmPassword: z.string().min(8, t('err_pass_min')),
  }).refine(data => data.password === data.confirmPassword, {
    message: t('err_pass_mismatch'),
    path: ['confirmPassword'],
  }), [t])

  type ResetData = z.infer<typeof resetSchema>

  const { register, handleSubmit, formState: { errors } } = useForm<ResetData>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: ResetData) => {
    onSetAlert('', 'success')
    setLoading(true)
    try {
      const { error } = await getSupabase().auth.updateUser({ password: data.password })
      if (error) throw error
      // BUG CORRIGIDO (feature aprovada pelo usuário): a sessão de
      // recuperação usada pra trocar a senha é temporária e escopada só
      // pra essa ação — desloga explicitamente e manda de volta pro login
      // normal, tanto por segurança (um link de recuperação encaminhado/
      // compartilhado não deixa a conta logada) quanto pra confirmar que a
      // senha nova realmente funciona.
      await getSupabase().auth.signOut()
      onSetAlert(t('auth_reset_success'), 'success')
      onSuccess()
    } catch (err: any) {
      console.error('[ResetPassword] Erro ao redefinir senha:', err.message)
      onSetAlert(t('auth_reset_error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--clr-text)' }}>{t('auth_reset_title')}</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--clr-text-muted)' }}>
          {t('auth_reset_desc')}
        </p>
      </div>

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="reset-password" className="form-label">{t('auth_new_pass')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            className={`form-input ${errors.password ? 'is-invalid' : ''}`}
            placeholder={t('auth_new_pass_ph')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'reset-password-error' : undefined}
            {...register('password')}
          />
          <button
            type="button"
            aria-label={showPassword ? tr.hidePassword : tr.showPassword}
            className="toggle-password"
            onClick={() => setShowPassword(!showPassword)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {showPassword ? (
                <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
              ) : (
                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
              )}
            </svg>
          </button>
        </div>
        {errors.password && <span id="reset-password-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.password.message}</span>}
      </div>

      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="reset-confirm-password" className="form-label">{t('auth_confirm_pass')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <input
            id="reset-confirm-password"
            type={showPassword ? 'text' : 'password'}
            className={`form-input ${errors.confirmPassword ? 'is-invalid' : ''}`}
            placeholder={t('auth_confirm_pass_ph')}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'reset-confirm-password-error' : undefined}
            {...register('confirmPassword')}
          />
        </div>
        {errors.confirmPassword && <span id="reset-confirm-password-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.confirmPassword.message}</span>}
      </div>

      <button type="submit" className="btn btn--accent btn--lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
        {loading ? t('auth_reset_ing') : t('auth_reset_btn')}
      </button>
    </form>
  )
}
