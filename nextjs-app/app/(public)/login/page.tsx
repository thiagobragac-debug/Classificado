'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { loginWithEmail, signupWithEmail, loginWithGoogle, resetPassword } from '@/lib/supabase'
import { getSupabase } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'

function LoginForm() {
  const router = useRouter()
  const { lang, setLang } = useLang()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const searchParams = useSearchParams()
  
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [alertInfo, setAlertInfo] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Login fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  // Register fields
  const [regName, setRegName] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regDoc, setRegDoc] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regCep, setRegCep] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')

  useEffect(() => {
    if (searchParams.get('mode') === 'register') {
      setMode('register')
    } else if (searchParams.get('mode') === 'reset') {
      setAlertInfo({ msg: 'Você pode redefinir sua senha agora (implementação pendente na UI).', type: 'success' })
    }
  }, [searchParams])

  const showAlert = (msg: string, type: 'success' | 'error') => {
    setAlertInfo({ msg, type })
  }

  useEffect(() => {
    const rawLogo = typeof window !== 'undefined' ? localStorage.getItem('tc_logo_url') : null;
    if (rawLogo && !rawLogo.startsWith('javascript')) {
      setLogoUrl(rawLogo);
    }

    async function fetchPlatformSettings() {
      try {
        const { data } = await getSupabase().from('platform_settings').select('logo_url').single();
        if (data?.logo_url) {
          const url = data.logo_url;
          if (!url.startsWith('javascript')) {
            setLogoUrl(url);
            if (typeof window !== 'undefined') {
              localStorage.setItem('tc_logo_url', url);
            }
          }
        }
      } catch (e) {}
    }
    fetchPlatformSettings();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAlertInfo(null)
    setLoading(true)
    try {
      await loginWithEmail(loginEmail, loginPass)
      const redirect = searchParams.get('next') || searchParams.get('redirect')
      
      let safeRedirect = '/painel'
      if (redirect) {
        try {
          const resolved = new URL(redirect, window.location.origin)
          if (resolved.origin === window.location.origin) {
            safeRedirect = resolved.pathname + resolved.search
          } else {
            // Se falhar no URL builder, pode ser rota relativa (ex: /anuncio/123)
            if (redirect.startsWith('/')) {
              safeRedirect = redirect;
            }
          }
        } catch {
          if (redirect.startsWith('/')) safeRedirect = redirect;
        }
      }
      
      router.push(safeRedirect)
    } catch (err: any) {
      showAlert(err.message || 'Erro ao fazer login.', 'error')
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAlertInfo(null)
    setLoading(true)
    try {
      const authData = await signupWithEmail(regEmail, regPass, regName)
      
      if (authData && authData.user) {
        const sb = getSupabase()
        await sb.from('profiles').update({
          display_name: regDisplayName,
          document_number: regDoc,
          phone_whatsapp: regPhone,
          zip_code: regCep
        }).eq('id', authData.user.id)
      }

      showAlert('Conta criada com sucesso! Você já pode fazer login.', 'success')
      setMode('login')
      
      // Reset form
      setRegName(''); setRegDisplayName(''); setRegDoc(''); setRegPhone(''); setRegCep(''); setRegEmail(''); setRegPass('');
    } catch (err: any) {
      const msg = err.message?.includes('already registered') ? 'Este e-mail já está cadastrado.' : err.message
      showAlert(msg || 'Erro ao criar conta.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      await loginWithGoogle()
    } catch(err: any) {
      showAlert(err.message || 'Erro ao conectar com Google.', 'error')
    }
  }

  const handleForgot = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!loginEmail) {
      showAlert('Digite seu e-mail primeiro no campo acima.', 'error')
      return
    }
    try {
      await resetPassword(loginEmail)
      showAlert('E-mail de redefinição enviado.', 'success')
    } catch (err: any) {
      showAlert(err.message || 'Erro ao enviar.', 'error')
    }
  }

  return (
    <main className="login-split v2">
      {/* Lang Toggle */}
      <div className="lang-toggle" role="group" aria-label="Selecionar idioma" style={{ position: 'fixed', top: '1.2rem', right: '1.2rem', zIndex: 999 }}>
        <button className={lang === 'pt' ? 'active' : ''} onClick={() => setLang('pt')} aria-label="Português">PT</button>
        <button className={lang === 'es' ? 'active' : ''} onClick={() => setLang('es')} aria-label="Español">ES</button>
      </div>

      {/* Left Banner */}
      <div className="login-banner">
        <Link href="/" className="logo" style={{ marginBottom: '3rem', filter: 'brightness(0) invert(1)', textDecoration: 'none' }}>
          {logoUrl ? (
            <div className="logo-mark" style={{
              backgroundImage: `url('${logoUrl}')`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left center',
              backgroundColor: 'transparent',
              borderColor: 'transparent'
            }}></div>
          ) : (
            <div className="logo-mark" style={{ background: 'var(--clr-primary)', color: 'white', borderColor: 'white' }}>TC</div>
          )}
          <div className="logo-text">
            <span className="logo-name" style={{ fontSize: '1.4rem' }}>Tauze Class</span>
            <span className="logo-tagline" style={{ color: 'rgba(255,255,255,0.7)' }}>CLASSIFICADOS AGRO</span>
          </div>
        </Link>

        <h2>O agronegócio do <br/><span style={{ color: '#F59E0B' }}>Brasil</span><br/> em um só lugar.</h2>
        <p>Anuncie gratuitamente para milhares de compradores no Brasil, Argentina, Paraguai e Uruguai.</p>

        <div className="login-badges">
          <span className="badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 
            Gratuito para anunciar
          </span>
          <span className="badge"><span style={{fontSize:'14px'}}>🌎</span> Mercosul completo</span>
          <span className="badge"><span style={{fontSize:'14px'}}>🏷️</span> 62.000+ anúncios</span>
        </div>
      </div>

      {/* Right Form */}
      <div className="login-form-area">
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>

          <div className="auth-toggle">
            <button className={`toggle-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Entrar</button>
            <button className={`toggle-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Criar Conta</button>
          </div>

          <div className="social-login">
            <button className="btn-social" onClick={handleGoogle}>
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span>Continuar com Google</span>
            </button>
          </div>

          <div className="divider">ou continue com e-mail</div>

          {alertInfo && (
            <div style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 8, fontSize: '0.9rem', background: alertInfo.type === 'error' ? '#fef2f2' : '#f0fdf4', color: alertInfo.type === 'error' ? '#dc2626' : '#16a34a', border: alertInfo.type === 'error' ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
              {alertInfo.msg}
            </div>
          )}

          {/* LOGIN SECTION */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" className="form-input" required placeholder="seu@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label">Senha</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input type={showPassword ? "text" : "password"} className="form-input" required placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} />
                  <svg className="toggle-password" onClick={() => setShowPassword(!showPassword)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword ? (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
                    ) : (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
                    )}
                  </svg>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem', fontSize: '0.9rem' }}>
                <a href="#" onClick={handleForgot} style={{ color: 'var(--clr-accent)', fontWeight: 600, textDecoration: 'none' }}>Esqueceu a senha?</a>
              </div>

              <button type="submit" className="btn btn--accent btn--lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar na Conta'}
              </button>
            </form>
          )}

          {/* REGISTER SECTION */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group">
                <label className="form-label">Nome Completo</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <input type="text" className="form-input" required placeholder="João da Silva" value={regName} onChange={e => setRegName(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nome de Exibição / Fazenda</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  <input type="text" className="form-input" required placeholder="Ex: Fazenda São João" value={regDisplayName} onChange={e => setRegDisplayName(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CPF / CNPJ</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <input type="text" className="form-input" required placeholder="000.000.000-00 ou 00.000.000/0001-00" maxLength={20} value={regDoc} onChange={e => setRegDoc(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">WhatsApp / Telefone</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  <input type="tel" className="form-input" required placeholder="+55 (99) 9 9999-9999" value={regPhone} onChange={e => setRegPhone(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CEP</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <input type="text" className="form-input" required placeholder="00000-000" value={regCep} onChange={e => setRegCep(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">E-mail</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" className="form-input" required placeholder="seu@email.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label className="form-label">Senha</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input type={showPassword ? "text" : "password"} required placeholder="••••••••" minLength={8} value={regPass} onChange={e => setRegPass(e.target.value)} />
                  <svg className="toggle-password" onClick={() => setShowPassword(!showPassword)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword ? (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
                    ) : (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
                    )}
                  </svg>
                </div>
              </div>

              <button type="submit" className="btn btn--primary btn--lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Criando conta...' : 'Criar Conta'}
              </button>
            </form>
          )}

        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{marginTop:'var(--header-h)', padding:'2rem', textAlign:'center'}}>Carregando...</div>}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  return (
    <React.Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Carregando...</div>}>
      <LoginForm />
    </React.Suspense>
  )
}
