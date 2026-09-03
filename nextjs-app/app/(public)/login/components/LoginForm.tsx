import React, { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { loginWithEmail, loginWithGoogleIdToken } from '@/lib/supabase'
import { signInWithGooglePrompt, GoogleSignInCancelled } from '@/lib/google-identity'
import { useLang } from '@/lib/lang-context'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'

interface LoginFormProps {
  onSetAlert: (msg: string, type: 'success' | 'error') => void
  onNavigateToForgot: (email: string) => void
  initialEmail?: string
}

// Mensagens de erro genéricas e aria-labels exclusivos deste formulário —
// padrão local de TRANSLATIONS (os labels de campo já usam o dicionário
// global I18N via t()).
const TRANSLATIONS = {
  pt: {
    loginError: 'Erro ao fazer login.',
    googleError: 'Erro ao conectar com Google.',
    hidePassword: 'Ocultar senha',
    showPassword: 'Mostrar senha',
  },
  es: {
    loginError: 'Error al iniciar sesión.',
    googleError: 'Error al conectar con Google.',
    hidePassword: 'Ocultar contraseña',
    showPassword: 'Mostrar contraseña',
  },
} as const

// BUG CORRIGIDO (varredura cruzada de cenários, achado de segurança): a
// checagem anterior só rejeitava valores começando com "//" — mas
// "/\evil.com" também começa com uma única barra e o navegador resolve
// isso como URL relativa-a-esquema (protocol-relative), mandando o usuário
// pra um domínio externo logo após o login. new URL(...).origin compara a
// origem de verdade, sem depender de heurística de prefixo de string.
function getSafeRedirect(raw: string | null, fallback = '/painel'): string {
  if (!raw) return fallback
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin === window.location.origin) {
      return url.pathname + url.search + url.hash
    }
  } catch { /* raw inválido, cai no fallback */ }
  return fallback
}

export function LoginForm({ onSetAlert, onNavigateToForgot, initialEmail = '' }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, lang } = useLang()
  const tr = TRANSLATIONS[lang]

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const loginSchema = useMemo(() => z.object({
    email: z.string().email(t('err_email')),
    password: z.string().min(1, t('err_pass_req'))
  }), [t])

  type LoginData = z.infer<typeof loginSchema>

  const { register, handleSubmit, formState: { errors }, watch } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: initialEmail }
  })

  const emailValue = watch('email')

  const onSubmit = async (data: LoginData) => {
    onSetAlert('', 'success')
    setLoading(true)
    try {
      await loginWithEmail(data.email, data.password)
      const redirect = searchParams.get('next') || searchParams.get('redirect') || searchParams.get('redirectTo')
      const safeRedirect = getSafeRedirect(redirect)

      // Hard redirect para garantir o envio correto dos cookies para o servidor
      window.location.href = safeRedirect
    } catch (err: any) {
      // BUG CORRIGIDO (teste completo do site, 2026-08-24): mensagem de
      // erro do Supabase vinha crua em inglês ("Invalid login credentials"),
      // enquanto o resto do formulário é todo traduzido PT/ES.
      //
      // BUG CORRIGIDO (validação do zero, rodada 6): só a mensagem exata
      // "Invalid login credentials" caía no fallback traduzido — qualquer
      // OUTRO erro do Supabase Auth (limite de taxa, rede, provedor
      // desabilitado) mostrava err.message cru em inglês pro usuário PT/ES.
      // O detalhe original ainda vai pro console pra depuração.
      console.error('[Login] Erro de autenticação:', err.message)
      const msg = err.message === 'Invalid login credentials'
        ? t('err_invalid_credentials')
        : tr.loginError
      onSetAlert(msg, 'error')
      setLoading(false)
    }
  }

  // BUG CORRIGIDO (feature aprovada pelo usuário, 2026-09-02): trocado do
  // fluxo de redirect (signInWithOAuth) pro Google Identity Services —
  // signInWithGooglePrompt() abre o seletor de conta DENTRO da própria
  // página (sem sair do domínio), devolve o ID token, e loginWithGoogleIdToken
  // troca isso por uma sessão de verdade via supabase.auth.signInWithIdToken.
  // Sem redirect nenhum, não existe mais a etapa de callback — o redirect
  // pós-login (mesma lógica de segurança de sempre, getSafeRedirect) acontece
  // aqui direto, igual ao login por e-mail/senha logo acima.
  const handleGoogle = async () => {
    setGoogleLoading(true)
    onSetAlert('', 'success')
    try {
      const { idToken, nonce } = await signInWithGooglePrompt()
      await loginWithGoogleIdToken(idToken, nonce)
      const redirect = searchParams.get('next') || searchParams.get('redirect') || searchParams.get('redirectTo')
      const safeRedirect = getSafeRedirect(redirect)
      window.location.href = safeRedirect
    } catch (err: any) {
      // Usuário fechou o seletor de conta sem escolher nada — não é erro,
      // só volta o botão ao normal em silêncio.
      if (err instanceof GoogleSignInCancelled) {
        setGoogleLoading(false)
        return
      }
      // BUG CORRIGIDO (i18n): err.message do Supabase vazava cru em inglês na UI.
      console.error('[Login Google] Erro:', err.message)
      onSetAlert(tr.googleError, 'error')
      setGoogleLoading(false)
    }
  }

  return (
    <>
      <div className="social-login">
        <button type="button" className="btn-social" onClick={handleGoogle} disabled={googleLoading} aria-disabled={googleLoading}>
          {googleLoading ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          )}
          <span>{t('auth_google')}</span>
        </button>
      </div>

      <div className="divider">{t('auth_or_email')}</div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-group">
          <label htmlFor="login-email" className="form-label">{t('auth_email')}</label>
          <div className="input-with-icon">
            <Mail size={18} aria-hidden="true" style={{ position: 'absolute', left: '1rem', color: 'var(--clr-muted)' }} />
            <input 
              id="login-email"
              type="email" 
              className={`form-input ${errors.email ? 'is-invalid' : ''}`} 
              placeholder={t('auth_email_ph')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              {...register('email')} 
            />
          </div>
          {errors.email && <span id="login-email-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.email.message}</span>}
        </div>

        <div className="form-group" style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="login-password" className="form-label">{t('auth_pass')}</label>
          <div className="input-with-icon">
            <Lock size={18} aria-hidden="true" style={{ position: 'absolute', left: '1rem', color: 'var(--clr-muted)' }} />
            <input 
              id="login-password"
              type={showPassword ? "text" : "password"} 
              className={`form-input ${errors.password ? 'is-invalid' : ''}`} 
              placeholder={t('auth_pass_ph')}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              {...register('password')} 
            />
            <button 
              type="button"
              aria-label={showPassword ? tr.hidePassword : tr.showPassword}
              aria-pressed={showPassword}
              className="toggle-password" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', outline: 'none' }}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <span id="login-password-error" role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.2rem', display: 'block' }}>{errors.password.message}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem', fontSize: '0.9rem' }}>
          <button 
            type="button"
            onClick={() => onNavigateToForgot(emailValue || '')} 
            style={{ color: 'var(--clr-accent)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {t('auth_forgot')}
          </button>
        </div>

        <button type="submit" className="btn btn--accent btn--lg" style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={loading} aria-disabled={loading}>
          {loading ? <><Loader2 size={20} className="animate-spin" /> {t('auth_login_ing')}</> : t('auth_login_btn')}
        </button>
      </form>
    </>
  )
}
