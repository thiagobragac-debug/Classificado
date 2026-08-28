'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useLang } from '@/lib/lang-context';
import { getSupabase, getSession } from '@/lib/supabase';
import { SECRET_SETTING_KEYS } from '@/lib/secret-settings';

// ─── Sanitiza URL do logo (mesmo critério do main.js original) ────────────────
function sanitizeLogoUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return null;
    if (parsed.protocol === 'data:' && !url.startsWith('data:image/')) return null;
    return url;
  } catch {
    return url.startsWith('javascript') ? null : url;
  }
}

// ─── Sanitiza cor CSS (mesmo critério do main.js original) ───────────────────
function sanitizeCssColor(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)$/.test(value)) return value;
  return null;
}

const TRANSLATIONS = {
  pt: {
    tagline: 'Classificados Agro',
    homeAria: 'Tauze Class — Início',
    navAria: 'Menu principal',
    mobileNavAria: 'Menu mobile',
    myMessages: 'Minhas Mensagens',
    myAccountAria: 'Minha conta',
    myPanel: 'Meu Painel',
    myAds: 'Meus Anúncios',
    mySubscription: 'Minha Assinatura',
    signOut: 'Sair da Conta',
    user: 'Usuário',
    premiumUser: 'Usuário Premium',
    langGroupAria: 'Selecionar idioma',
    closeMenu: 'Fechar menu',
    openMenu: 'Abrir menu',
    myAccountMobile: 'Minha Conta',
    registerSuffix: 'Cadastrar',
  },
  es: {
    tagline: 'Clasificados Agro',
    homeAria: 'Tauze Class — Inicio',
    navAria: 'Menú principal',
    mobileNavAria: 'Menú móvil',
    myMessages: 'Mis Mensajes',
    myAccountAria: 'Mi cuenta',
    myPanel: 'Mi Panel',
    myAds: 'Mis Anuncios',
    mySubscription: 'Mi Suscripción',
    signOut: 'Cerrar Sesión',
    user: 'Usuario',
    premiumUser: 'Usuario Premium',
    langGroupAria: 'Seleccionar idioma',
    closeMenu: 'Cerrar menú',
    openMenu: 'Abrir menú',
    myAccountMobile: 'Mi Cuenta',
    registerSuffix: 'Registrarse',
  },
} as const;

export default function Header({ 
  initialIsLoggedIn = false,
  initialUserInitials = ''
}: { 
  initialIsLoggedIn?: boolean;
  initialUserInitials?: string;
} = {}) {
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();
  const tt = TRANSLATIONS[lang];

  // ─── All hooks must be declared unconditionally before any early return ──
  const [scrolled, setScrolled]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [isLoggedIn, setIsLoggedIn]     = useState(initialIsLoggedIn);
  const [userInitials, setUserInitials] = useState(initialUserInitials);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userSession, setUserSession]   = useState<any>(null);
  const userMenuRef                     = useRef<HTMLDivElement>(null);

  // Logo e cor dinâmicos (buscados do admin / platform_settings)
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoMarkRef           = useRef<HTMLDivElement>(null);
  const dynStyleRef           = useRef<HTMLStyleElement | null>(null);

  // ─── applyDynamicSettings ────────────────────────────────────────────────
  const applyDynamicSettings = () => {
    const rawLogo     = localStorage.getItem('tc_logo_url');
    // BUG CORRIGIDO: o admin (app/(admin)/admin/configuracoes) salva e o
    // syncPlatformSettings abaixo espelha no localStorage sob a chave
    // 'primary_color' (nome da linha em platform_settings), nunca
    // 'tc_primary_color'. Com o nome errado aqui, rawColor era sempre null e
    // a cor primária definida no admin nunca era aplicada ao site.
    const rawColor    = localStorage.getItem('primary_color');
    const safeLogoUrl = sanitizeLogoUrl(rawLogo);

    setLogoUrl(safeLogoUrl);

    // Cor primária dinâmica
    const primaryColor = sanitizeCssColor(rawColor);
    if (primaryColor) {
      if (!dynStyleRef.current) {
        const s = document.createElement('style');
        s.id = 'tc-dynamic-colors';
        document.head.appendChild(s);
        dynStyleRef.current = s;
      }
      dynStyleRef.current.textContent =
        `:root { --clr-primary: ${primaryColor} !important; --clr-primary-mid: ${primaryColor} !important; }`;
    }
  };

  // ─── syncPlatformSettings — busca do Supabase e salva no localStorage ────
  const syncPlatformSettings = async () => {
    try {
      const sb = getSupabase();
      // GAP DE SEGURANÇA CORRIGIDO (auditoria completa, 2026-08-25):
      // select('*') aqui devolvia TODAS as colunas de platform_settings pra
      // quem tem is_admin=true via RLS — incluindo os segredos dos 4
      // gateways de pagamento (stripe/mp/pagarme/asaas) — e o código gravava
      // cada key/value retornado direto no localStorage sem filtro nenhum,
      // ao contrário de app/api/admin/settings/route.ts, que já tem essa
      // proteção. O logout não limpa localStorage, então os segredos
      // ficavam expostos a qualquer script da página (inclusive XSS)
      // indefinidamente, mesmo depois do admin sair da conta. Agora as
      // linhas secretas são excluídas já na query (nunca chegam ao
      // navegador) e, por segurança extra, filtradas de novo antes de
      // gravar.
      const { data, error } = await sb
        .from('platform_settings')
        .select('key, value')
        .not('key', 'in', `(${SECRET_SETTING_KEYS.join(',')})`);
      if (!error && data && data.length > 0) {
        let changed = false;
        data.forEach((s: { key: string; value: string }) => {
          if ((SECRET_SETTING_KEYS as readonly string[]).includes(s.key)) return;
          if (localStorage.getItem(s.key) !== s.value) {
            localStorage.setItem(s.key, s.value);
            changed = true;
          }
        });
        if (changed) applyDynamicSettings();
      }
    } catch (err) {
      console.error('[TC] syncPlatformSettings error:', err);
    }
  };

  useEffect(() => {
    const closeUserMenu = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeUserMenu);
    return () => document.removeEventListener('mousedown', closeUserMenu);
  }, []);

  useEffect(() => {
    // Autenticação
    getSession().then(session => {
      setIsLoggedIn(!!session);
      setUserSession(session);
      if (session) {
        const ini = localStorage.getItem('tc_user_initials');
        if (ini) {
          setUserInitials(ini);
        } else {
          const email = session.user.email || '';
          const name = session.user.user_metadata?.name || session.user.user_metadata?.display_name || email.split('@')[0] || 'U';
          const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
          setUserInitials(initials);
          localStorage.setItem('tc_user_initials', initials);
        }
      }
    });

    // Aplica configurações salvas localmente (rápido, sem rede)
    applyDynamicSettings();

    // Sincroniza do Supabase em background (mesmo comportamento do original)
    syncPlatformSettings();

    // Scroll listener
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Atualiza favicon quando logo muda ──────────────────────────────────
  useEffect(() => {
    if (!logoUrl) return;
    // Remove todos os favicons existentes e cria um novo com o logo do admin
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach(el => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = logoUrl;
    document.head.appendChild(link);
  }, [logoUrl]);

  // Fecha o menu mobile ao navegar
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // ─── Early returns AFTER all hooks (Rules of Hooks) ─────────────────────
  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/login')) return null;

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  // ─── Estilo do logo-mark (imagem ou gradiente CSS) ───────────────────────
  const logoMarkStyle = logoUrl ? {
    backgroundImage: `url('${logoUrl}')`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundColor: 'transparent',
  } : undefined;

  return (
    <>
      {/* ─── HEADER ─────────────────────────────── */}
      <header className={`site-header${scrolled ? ' scrolled' : ''}`} role="banner">
        <div className="container header-inner">

          <Link href="/" className="logo" aria-label={tt.homeAria}>
            <div className="logo-mark" ref={logoMarkRef} style={logoMarkStyle}>
              {!logoUrl && 'TC'}
            </div>
            <div className="logo-text">
              <span className="logo-name">Tauze Class</span>
              <span className="logo-tagline">{tt.tagline}</span>
            </div>
          </Link>

          <nav className="header-nav" role="navigation" aria-label={tt.navAria}>
            <Link href="/"          className={isActive('/') && pathname === '/' ? 'active' : ''}>{t('nav_home')}</Link>
            <Link href="/listagem"  className={isActive('/listagem') ? 'active' : ''}>{t('nav_ads')}</Link>
            <Link href="/eventos"   className={isActive('/eventos') ? 'active' : ''}>{t('nav_events')}</Link>
            <Link href="/leiloes"   className={`nav-live${isActive('/leiloes') ? ' active' : ''}`}>
              <span className="live-indicator"></span>
              <span>{t('nav_auctions')}</span>
            </Link>
            {!isLoggedIn && (
              <Link href="/planos" className={isActive('/planos') ? 'active' : ''}>{t('nav_plans')}</Link>
            )}
            <div className="auth-wrapper">
              {isLoggedIn ? (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Link href="/painel#messages" title={tt.myMessages}
                    onClick={() => window.dispatchEvent(new CustomEvent('painel:switchtab', { detail: 'messages' }))}
                    style={{
                      position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', width: 42, height: 42, borderRadius: '50%',
                      background: '#f8fafc', transition: 'background 0.2s, box-shadow 0.2s',
                      border: '1px solid #e2e8f0', textDecoration: 'none'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s, transform 0.2s' }}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {/* Badge could be dynamically visible later if we fetch unread count */}
                  </Link>
                  <div ref={userMenuRef} style={{ position: 'relative' }}>
                    <button id="header-avatar" aria-label={tt.myAccountAria}
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 14px rgba(22, 163, 74, 0.35)'; }}
                      onMouseOut={e => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(22, 163, 74, 0.25)'; }}
                      style={{
                        display: 'flex', width: 42, height: 42, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--clr-primary), #0ea5e9)', color: 'white',
                        alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '1rem', border: '2px solid #fff', cursor: 'pointer',
                        boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)',
                        transition: 'all .3s cubic-bezier(0.4, 0, 0.2, 1)', userSelect: 'none'
                      }}>
                      {userInitials || 'U'}
                    </button>
                    {userMenuOpen && (
                      <div className="header-user-dropdown"
                        onMouseLeave={() => setUserMenuOpen(false)}
                        style={{
                          position: 'absolute', top: 'calc(100% + 12px)', right: 0,
                          width: 240, background: '#fff', borderRadius: 16,
                          boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)',
                          display: 'flex', flexDirection: 'column', padding: 8, zIndex: 1000,
                          animation: 'fadeIn 0.2s ease'
                        }}>
                        <div style={{ padding: '12px 16px', marginBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 700, color: 'var(--clr-heading)', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {userSession?.user?.user_metadata?.name || userSession?.user?.user_metadata?.display_name || userSession?.user?.email?.split('@')[0] || tt.user}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {userSession?.user?.email || tt.premiumUser}
                          </span>
                        </div>
                        <Link href="/painel" onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new CustomEvent('painel:switchtab', { detail: 'ads' })) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--clr-text)', textDecoration: 'none', fontSize: '0.92rem', borderRadius: 10, fontWeight: 600 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
                          <span>{tt.myPanel}</span>
                        </Link>
                        <Link href="/painel#ads" onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new CustomEvent('painel:switchtab', { detail: 'ads' })) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--clr-text)', textDecoration: 'none', fontSize: '0.92rem', borderRadius: 10, fontWeight: 600 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          <span>{tt.myAds}</span>
                        </Link>
                        <Link href="/painel#messages" onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new CustomEvent('painel:switchtab', { detail: 'messages' })) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--clr-text)', textDecoration: 'none', fontSize: '0.92rem', borderRadius: 10, fontWeight: 600 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          <span>{tt.myMessages}</span>
                        </Link>
                        <Link href="/painel#billing" onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new CustomEvent('painel:switchtab', { detail: 'billing' })) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--clr-text)', textDecoration: 'none', fontSize: '0.92rem', borderRadius: 10, fontWeight: 600 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                          <span>{tt.mySubscription}</span>
                        </Link>
                        <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '4px 8px' }}></div>
                        <button onClick={async () => {
                          setUserMenuOpen(false);
                          // Defesa em profundidade: limpa qualquer resíduo de
                          // chave secreta que possa ter sido gravado antes
                          // desta correção (ou por algum bug futuro).
                          SECRET_SETTING_KEYS.forEach(k => localStorage.removeItem(k));
                          await getSupabase().auth.signOut();
                          window.location.href = '/login';
                        }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: '#DC2626', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.92rem', borderRadius: 10, fontWeight: 600 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                          <span>{tt.signOut}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Link href="/login">{t('nav_login')}</Link>
              )}
            </div>
          </nav>

          <div className="lang-toggle" role="group" aria-label={tt.langGroupAria}>
            <button data-lang="pt" className={lang === 'pt' ? 'active' : ''} aria-label="Português" onClick={() => setLang('pt')}>PT</button>
            <button data-lang="es" className={lang === 'es' ? 'active' : ''} aria-label="Español"   onClick={() => setLang('es')}>ES</button>
          </div>

          <Link href="/anunciar" className="btn-anunciar-header" id="btn-post-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{t('btn_post')}</span>
          </Link>

          <button
            className={`hamburger${mobileOpen ? ' open' : ''}`}
            aria-label={mobileOpen ? tt.closeMenu : tt.openMenu}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {/* ─── MOBILE MENU ─────────────────────────── */}
      <nav className={`mobile-menu${mobileOpen ? ' open' : ''}`} id="mobile-menu" aria-label={tt.mobileNavAria}>
        <Link href="/"         className={pathname === '/' ? 'active' : ''}>{t('nav_home')}</Link>
        <Link href="/listagem" className={isActive('/listagem') ? 'active' : ''}>{t('nav_ads')}</Link>
        <Link href="/eventos"  className={isActive('/eventos') ? 'active' : ''}>{t('nav_events')}</Link>
        <Link href="/leiloes"  className={`nav-live${isActive('/leiloes') ? ' active' : ''}`}>
          <span className="live-indicator"></span>
          <span>{t('nav_auctions')}</span>
        </Link>
        {!isLoggedIn && (
          <Link href="/planos" className={isActive('/planos') ? 'active' : ''}>{t('nav_plans')}</Link>
        )}
        {/* BUG CORRIGIDO (validação do zero, rodada 6): o toggle de idioma do
            header (.lang-toggle logo acima) some no mobile via CSS, sem
            nenhum substituto aqui dentro — usuário mobile ficava sem
            NENHUMA forma de trocar de idioma nas páginas que usam este
            Header. */}
        <div className="lang-toggle" role="group" aria-label={tt.langGroupAria} style={{ alignSelf: 'flex-start', margin: 'var(--sp-2) 0' }}>
          <button data-lang="pt" className={lang === 'pt' ? 'active' : ''} aria-label="Português" onClick={() => setLang('pt')}>PT</button>
          <button data-lang="es" className={lang === 'es' ? 'active' : ''} aria-label="Español"   onClick={() => setLang('es')}>ES</button>
        </div>
        <div className="auth-wrapper" style={{ width: '100%' }}>
          <Link href={isLoggedIn ? '/painel' : '/login'} className="btn-login-mobile">
            {isLoggedIn ? tt.myAccountMobile : `${t('nav_login')} / ${tt.registerSuffix}`}
          </Link>
        </div>
      </nav>
    </>
  );
}
