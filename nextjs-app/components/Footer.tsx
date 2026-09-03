'use client';

import Link from 'next/link';
import { useLang } from '@/lib/lang-context';
import { FOOTER_LINKS } from '@/lib/constants';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { stripLocale } from '@/lib/locale';

const TRANSLATIONS = {
  pt: {
    tagline: 'Classificados Agro',
    allRightsReserved: 'Todos os direitos reservados.',
    home: 'Início',
    support: 'Suporte',
    termsOfUse: 'Termos de Uso',
    privacy: 'Privacidade',
    terms: 'Termos',
    cookies: 'Cookies',
  },
  es: {
    tagline: 'Clasificados Agro',
    allRightsReserved: 'Todos los derechos reservados.',
    home: 'Inicio',
    support: 'Soporte',
    termsOfUse: 'Términos de Uso',
    privacy: 'Privacidad',
    terms: 'Términos',
    cookies: 'Cookies',
  },
} as const;

export default function Footer() {
  const { lang, t } = useLang();
  const pathname = usePathname();
  const links = FOOTER_LINKS[lang as 'pt' | 'es'];
  const tt = TRANSLATIONS[lang as 'pt' | 'es'];
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Only access localStorage on the client
    const safeLogoUrl = localStorage.getItem('tc_logo_url');
    if (safeLogoUrl) {
      try {
        const parsed = new URL(safeLogoUrl);
        if (['http:', 'https:', 'data:'].includes(parsed.protocol)) {
          setLogoUrl(safeLogoUrl);
        }
      } catch {
        // invalid URL
      }
    }
  }, []);

  // BUG CORRIGIDO (achado por auditoria, 2026-09-02 — mesma classe do bug já
  // corrigido em components/Header.tsx): usePathname() devolve o path CRU
  // visto pelo navegador (com prefixo /es quando presente), não o path
  // reescrito internamente — as duas comparações abaixo usavam `pathname`
  // direto contra rotas sem prefixo, então nunca reconheciam /es/login,
  // /es/admin nem nenhuma das rotas do footer simplificado quando o idioma
  // era espanhol. Normaliza com o mesmo stripLocale() já usado no Header.
  const effectivePathname = pathname ? stripLocale(pathname) : pathname;

  if (effectivePathname?.startsWith('/login') || effectivePathname?.startsWith('/cadastro') || effectivePathname?.startsWith('/admin')) return null;

  const isSimplified = effectivePathname?.startsWith('/painel') || effectivePathname?.startsWith('/anunciar') || effectivePathname?.startsWith('/listagem') || effectivePathname?.startsWith('/vendedor') || effectivePathname?.startsWith('/leiloes') || effectivePathname?.startsWith('/anuncio') || effectivePathname?.startsWith('/eventos');

  if (isSimplified) {
    return (
      <footer style={{ background: '#020617', padding: '1.25rem 0', color: '#94a3b8', fontSize: '.85rem' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <strong style={{ color: '#fff', fontSize: '.95rem' }}>Tauze Class</strong>
            <span>&copy; {new Date().getFullYear()} Tauze Class. {tt.allRightsReserved}</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontWeight: 500 }}>
            <Link href="/" style={{ color: '#cbd5e1', textDecoration: 'none' }}>{tt.home}</Link>
            <Link href="/institucional?page=ajuda" style={{ color: '#cbd5e1', textDecoration: 'none' }}>{tt.support}</Link>
            <Link href="/institucional?page=termos" style={{ color: '#cbd5e1', textDecoration: 'none' }}>{tt.termsOfUse}</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="container">
        <div className="footer-grid">

          <div className="footer-col">
            <div className="logo footer-logo" style={{ marginBottom: 'var(--sp-4)' }}>
              <div className="logo-mark" style={logoUrl ? { backgroundImage: `url('${logoUrl}')`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: 'transparent' } : undefined}>
                {!logoUrl && 'TC'}
              </div>
              <div className="logo-text">
                <span className="logo-name">Tauze Class</span>
                <span className="logo-tagline">{tt.tagline}</span>
              </div>
            </div>
            <p className="footer-desc">{t('footer_desc')}</p>
            {/* GAP CORRIGIDO (auditoria de usabilidade): os três ícones
                sociais (Instagram/Facebook/WhatsApp) usavam href="#" — links
                mortos que pareciam clicáveis. Removidos do DOM até existirem
                perfis/contatos reais para apontar; reintroduzir junto com o
                href verdadeiro quando existir. */}
          </div>

          <div className="footer-col">
            <h4>{t('footer_ads')}</h4>
            <ul>
              {links.ads.map((l) => (
                <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>{t('footer_help')}</h4>
            <ul>
              {links.help.map((l) => (
                <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>{t('footer_company')}</h4>
            <ul>
              {links.company.map((l) => (
                <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </div>

        </div>

        <div className="footer-bottom">
          <span>{t('footer_copy')}</span>
          <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
            <Link href="/institucional?page=privacidade">{tt.privacy}</Link>
            <Link href="/institucional?page=termos">{tt.terms}</Link>
            <Link href="/institucional?page=cookies">{tt.cookies}</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
