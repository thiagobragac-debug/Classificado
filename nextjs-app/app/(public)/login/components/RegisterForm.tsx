import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signupWithEmail, updateProfile } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'

interface RegisterFormProps {
  onSetAlert: (msg: string, type: 'success' | 'error') => void
  onSuccess: (email?: string) => void
}

// Mensagens de toast/resultado de submissão e aria-labels exclusivos deste
// formulário — padrão local de TRANSLATIONS (os labels de campo já usam o
// dicionário global I18N via t(), isso aqui cobre só o que faltava).
const TRANSLATIONS = {
  pt: {
    successCreated: 'Conta criada com sucesso! Você já pode fazer login.',
    emailTaken: 'Este e-mail já está cadastrado.',
    createError: 'Erro ao criar conta.',
    hidePassword: 'Ocultar senha',
    showPassword: 'Mostrar senha',
    confirmPassword: 'Confirmar Senha',
    confirmPasswordPh: '••••••••',
  },
  es: {
    successCreated: '¡Cuenta creada con éxito! Ya puedes iniciar sesión.',
    emailTaken: 'Este correo ya está registrado.',
    createError: 'Error al crear la cuenta.',
    hidePassword: 'Ocultar contraseña',
    showPassword: 'Mostrar contraseña',
    confirmPassword: 'Confirmar Contraseña',
    confirmPasswordPh: '••••••••',
  },
} as const

export function RegisterForm({ onSetAlert, onSuccess }: RegisterFormProps) {
  const { t, lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const registerSchema = useMemo(() => z.object({
    name: z.string().min(3, t('err_name')),
    displayName: z.string().min(2, t('err_display')),
    doc: z.string().min(11, t('err_doc')).max(20, t('err_doc')),
    phone: z.string().min(10, t('err_phone')),
    cep: z.string().min(8, t('err_cep')),
    email: z.string().email(t('err_email')),
    password: z.string().min(8, t('err_pass_min')),
    confirmPassword: z.string().min(8, t('err_pass_min')),
  }).refine(data => data.password === data.confirmPassword, {
    message: t('err_pass_mismatch'),
    path: ['confirmPassword'],
  }), [t])

  type RegisterData = z.infer<typeof registerSchema>

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema)
  })

  const onSubmit = async (data: RegisterData) => {
    onSetAlert('', 'success')
    setLoading(true)
    try {
      const authData = await signupWithEmail(data.email, data.password, data.name)

      if (authData && authData.user) {
        // BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): este
        // update ia direto pra 'profiles' com o campo 'zip_code' — coluna que
        // nunca existiu ali (CEP é dado sensível, roteado para user_secrets).
        // O UPDATE inteiro falhava (PGRST204), e como o erro não era checado,
        // display_name/phone_whatsapp eram perdidos JUNTO com o CEP, e a
        // tela ainda mostrava "Conta criada com sucesso!". updateProfile()
        // já sabe rotear cada campo para a tabela certa (SECRET_KEYS) e agora
        // lança se qualquer uma das duas gravações falhar.
        await updateProfile(authData.user.id, {
          display_name: data.displayName,
          phone_whatsapp: data.phone,
          zip_code: data.cep,
          document_number: data.doc,
        })
      }

      onSetAlert(tr.successCreated, 'success')
      onSuccess(data.email)
    } catch (err: any) {
      // BUG CORRIGIDO (i18n): qualquer erro do Supabase fora do caso
      // "already registered" vazava cru em inglês na UI.
      console.error('[Register] Erro ao criar conta:', err.message)
      const msg = err.message?.includes('already registered') ? tr.emailTaken : tr.createError
      onSetAlert(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-group">
        <label htmlFor="reg-name" className="form-label">{t('auth_name')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <input 
            id="reg-name"
            type="text" 
            className={`form-input ${errors.name ? 'is-invalid' : ''}`} 
            placeholder={t('auth_name_ph')}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "reg-name-error" : undefined}
            {...register('name')} 
          />
        </div>
        {errors.name && <span id="reg-name-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.name.message}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-display" className="form-label">{t('auth_display')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <input 
            id="reg-display"
            type="text" 
            className={`form-input ${errors.displayName ? 'is-invalid' : ''}`} 
            placeholder={t('auth_display_ph')}
            aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? "reg-display-error" : undefined}
            {...register('displayName')} 
          />
        </div>
        {errors.displayName && <span id="reg-display-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.displayName.message}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-doc" className="form-label">{t('auth_doc')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input 
            id="reg-doc"
            type="text" 
            className={`form-input ${errors.doc ? 'is-invalid' : ''}`} 
            placeholder={t('auth_doc_ph')}
            maxLength={20}
            aria-invalid={!!errors.doc}
            aria-describedby={errors.doc ? "reg-doc-error reg-doc-hint" : "reg-doc-hint"}
            {...register('doc')}
          />
        </div>
        <small id="reg-doc-hint" style={{ color: 'var(--clr-text-muted)', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>{t('auth_doc_ph')}</small>
        {errors.doc && <span id="reg-doc-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.doc.message}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-phone" className="form-label">{t('auth_phone')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          <input 
            id="reg-phone"
            type="tel" 
            className={`form-input ${errors.phone ? 'is-invalid' : ''}`} 
            placeholder={t('auth_phone_ph')}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "reg-phone-error reg-phone-hint" : "reg-phone-hint"}
            {...register('phone')}
          />
        </div>
        <small id="reg-phone-hint" style={{ color: 'var(--clr-text-muted)', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>{t('auth_phone_ph')}</small>
        {errors.phone && <span id="reg-phone-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.phone.message}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-cep" className="form-label">{t('auth_cep')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <input 
            id="reg-cep"
            type="text" 
            className={`form-input ${errors.cep ? 'is-invalid' : ''}`} 
            placeholder={t('auth_cep_ph')}
            aria-invalid={!!errors.cep}
            aria-describedby={errors.cep ? "reg-cep-error reg-cep-hint" : "reg-cep-hint"}
            {...register('cep')}
          />
        </div>
        <small id="reg-cep-hint" style={{ color: 'var(--clr-text-muted)', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>{t('auth_cep_ph')}</small>
        {errors.cep && <span id="reg-cep-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.cep.message}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="reg-email" className="form-label">{t('auth_email')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          <input 
            id="reg-email"
            type="email" 
            className={`form-input ${errors.email ? 'is-invalid' : ''}`} 
            placeholder={t('auth_email_ph')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "reg-email-error" : undefined}
            {...register('email')} 
          />
        </div>
        {errors.email && <span id="reg-email-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.email.message}</span>}
      </div>

      <div className="form-group" style={{ marginBottom: '2rem' }}>
        <label htmlFor="reg-password" className="form-label">{t('auth_pass')}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <input 
            id="reg-password"
            type={showPassword ? "text" : "password"} 
            className={`form-input ${errors.password ? 'is-invalid' : ''}`} 
            placeholder={t('auth_pass_ph')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "reg-password-error" : undefined}
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
        {errors.password && <span id="reg-password-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.password.message}</span>}
      </div>

      <div className="form-group" style={{ marginBottom: '2rem' }}>
        <label htmlFor="reg-confirm-password" className="form-label">{tr.confirmPassword}</label>
        <div className="input-with-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <input
            id="reg-confirm-password"
            type={showPassword ? "text" : "password"}
            className={`form-input ${errors.confirmPassword ? 'is-invalid' : ''}`}
            placeholder={tr.confirmPasswordPh}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "reg-confirm-password-error" : undefined}
            {...register('confirmPassword')}
          />
        </div>
        {errors.confirmPassword && <span id="reg-confirm-password-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.confirmPassword.message}</span>}
      </div>

      <button type="submit" className="btn btn--primary btn--lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
        {loading ? t('auth_register_ing') : t('auth_register_btn')}
      </button>
    </form>
  )
}
