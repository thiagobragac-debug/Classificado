'use client';

import Link from 'next/link';
import { useLang } from '@/lib/lang-context';
import { FOOTER_LINKS } from '@/lib/constants';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Footer() {
  const { lang, t } = useLang();
  const pathname = usePathname();
  const links = FOOTER_LINKS[lang as 'pt' | 'es'];
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

  if (pathname?.startsWith('/login') || pathname?.startsWith('/cadastro') || pathname?.startsWith('/admin')) return null;

  const isSimplified = pathname?.startsWith('/painel') || pathname?.startsWith('/anunciar') || pathname?.startsWith('/listagem') || pathname?.startsWith('/vendedor') || pathname?.startsWith('/leiloes') || pathname?.startsWith('/anuncio') || pathname?.startsWith('/eventos');

  if (isSimplified) {
    return (
      <footer style={{ background: '#020617', padding: '1.25rem 0', color: '#94a3b8', fontSize: '.85rem' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <strong style={{ color: '#fff', fontSize: '.95rem' }}>Tauze Class</strong>
            <span>&copy; {new Date().getFullYear()} Tauze Class. Todos os direitos reservados.</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontWeight: 500 }}>
            <Link href="/" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Início</Link>
            <Link href="/suporte" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Suporte</Link>
            <Link href="/institucional#termos" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Termos de Uso</Link>
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
                <span className="logo-tagline">Classificados Agro</span>
              </div>
            </div>
            <p className="footer-desc">{t('footer_desc')}</p>
            <div className="footer-social" aria-label="Redes sociais">
              <a href="#" className="social-btn" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                </svg>
              </a>
              <a href="#" className="social-btn" aria-label="Facebook">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
              <a href="#" className="social-btn" aria-label="WhatsApp">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.122 1.523 5.855L.057 23.268a.5.5 0 0 0 .618.635l5.579-1.461A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.924 0-3.72-.523-5.256-1.43l-.377-.224-3.914 1.025 1.044-3.81-.246-.393A9.716 9.716 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                </svg>
              </a>
            </div>
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
            <Link href="/institucional#privacidade">Privacidade</Link>
            <Link href="/institucional#termos">Termos</Link>
            <Link href="/institucional#cookies">Cookies</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
