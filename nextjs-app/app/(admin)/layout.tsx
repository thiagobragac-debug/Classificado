import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { flattenOne } from '@/lib/supabase'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import AdminMobileMenuButton from '@/components/admin/AdminMobileMenuButton'
import './admin/admin-v2.css'

export const metadata = {
  title: 'Admin - Tauze Class',
  robots: 'noindex, nofollow',
  icons: {
    icon: [{ url: '/api/favicon', type: 'image/png' }],
    apple: '/icon-192.svg',
    shortcut: '/api/favicon',
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Usar createClient() centralizado — sem credenciais hardcoded
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): sempre mandava
    // pro dashboard genérico (/admin) depois de logar, mesmo que o admin
    // tivesse tentado acessar uma página específica como /admin/leiloes.
    const requestedPath = (await headers()).get('x-pathname') || '/admin'
    redirect(`/login?redirectTo=${encodeURIComponent(requestedPath)}`)
  }

  // is_admin checado apenas server-side, nunca exposto ao cliente
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, user_secrets(is_admin, is_blocked)')
    .eq('id', user.id)
    .single()

  const secrets = flattenOne(profile?.user_secrets);

  if (!secrets?.is_admin) {
    redirect('/')
  }

  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): estas duas checagens
  // (conta bloqueada, sessão de recuperação de senha pendente) só existiam em
  // proxy.ts — e proxy.ts nunca roda para uma URL cuja extensão bate no
  // regex de "arquivo estático" do matcher, incluindo colisões acidentais
  // como /admin/leiloes/<qualquer-coisa>.png (Next.js roteia isso para esta
  // mesma dynamic route [id]). Um admin bloqueado ou em sessão de
  // recuperação pendente, cujo JWT ainda não expirou, continuava acessando
  // páginas de detalhe por essa via. Reimplementadas aqui como defesa em
  // profundidade — este layout roda sempre, independente do proxy.
  if (secrets?.is_blocked) {
    await supabase.auth.signOut()
    redirect('/login?error=blocked')
  }

  const { data: claimsData } = await supabase.auth.getClaims()
  const sessionId = (claimsData?.claims as any)?.session_id
  if (sessionId) {
    const { data: pendingRecovery } = await supabase
      .from('pending_password_recovery')
      .select('session_id')
      .eq('session_id', sessionId)
      .maybeSingle()

    if (pendingRecovery) {
      await supabase.auth.signOut()
      redirect('/login?error=recovery_session')
    }
  }

  return (
    <html lang="pt-BR">
      <head>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className="antialiased" style={{ margin: 0, padding: 0 }}>
        <ConfirmProvider>
          <div className="adm-layout">
            {/* Sidebar */}
          <aside className="adm-sidebar" id="adm-sidebar">
            <div className="adm-sidebar-logo">
              <div className="adm-logo-mark">TC</div>
              <div className="adm-logo-text">
                <div className="adm-logo-name">Tauze Class</div>
                <div className="adm-logo-sub">Admin Panel</div>
              </div>
            </div>
            
            <nav className="adm-nav">
              <div className="adm-nav-section">Principal</div>
              <Link href="/admin" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                <span>Dashboard</span>
              </Link>
              
              <div className="adm-nav-section">Conteúdo</div>
              <Link href="/admin/anuncios" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <span>Anúncios</span>
              </Link>
              <Link href="/admin/leiloes" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span>Leilões</span>
              </Link>
              <Link href="/admin/usuarios" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>Usuários</span>
              </Link>
              <Link href="/admin/denuncias" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                <span>Denúncias</span>
              </Link>
              <Link href="/admin/mensagens-contato" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span>Mensagens</span>
              </Link>
              <Link href="/admin/verificacoes" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Verificações</span>
              </Link>
              
              <div className="adm-nav-section">Sistema</div>
              <Link href="/admin/banners" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>Banners</span>
              </Link>
              <Link href="/admin/planos" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>Planos</span>
              </Link>
              <Link href="/admin/categorias" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                <span>Categorias</span>
              </Link>
              <Link href="/admin/subcategorias" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/><path d="M4 4l3 3"/></svg>
                <span>Subcategorias</span>
              </Link>
              <Link href="/admin/cupons" className="adm-nav-item">
                {/* BUG CORRIGIDO (validação adversarial final): este item usava o
                    mesmo ícone de "tag" de Categorias, logo acima — os dois
                    ficavam visualmente idênticos no menu, só distinguíveis pelo
                    texto. Ícone de percentual, condizente com cupom de desconto. */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                <span>Cupons</span>
              </Link>
              <Link href="/admin/assinaturas" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>Assinaturas</span>
              </Link>
              <Link href="/admin/api-keys" className="adm-nav-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                <span>Chaves API</span>
              </Link>
              <Link href="/admin/configuracoes" className="adm-nav-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Configurações</span>
                </Link>
                <div className="adm-nav-section">Página Inicial</div>
                <Link href="/admin/paginas" className="adm-nav-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span>Páginas Inst.</span>
                </Link>
                <Link href="/admin/depoimentos" className="adm-nav-item">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Depoimentos</span>
                </Link>
            </nav>

            <div className="adm-sidebar-footer">
              <div className="adm-user-pill">
                <div className="adm-user-avatar">{profile?.name ? profile.name.charAt(0).toUpperCase() : 'A'}</div>
                <div>
                  <div className="adm-user-name">{profile?.name || 'Admin'}</div>
                  <div className="adm-user-role">Administrador</div>
                </div>
              </div>
              <form action="/auth/signout" method="post" style={{ width: '100%', marginTop: '8px' }}>
                <button type="submit" className="adm-btn adm-btn--outline adm-btn--sm" style={{ width: '100%', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sair
                </button>
              </form>
            </div>
          </aside>

          <div className="adm-main">
            {/* Topbar */}
            <header className="adm-topbar">
              <div className="adm-breadcrumb">
                <AdminMobileMenuButton />
                <strong>Painel de Administração</strong>
              </div>
              <div className="adm-topbar-right">
                <Link href="/" className="adm-topbar-link" target="_blank">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Ver Site
                </Link>
              </div>
            </header>

            {/* Content */}
            <main className="adm-content">
              {children}
            </main>
          </div>
        </div>
        </ConfirmProvider>
      </body>
    </html>
  )
}
