'use client';

import Link from 'next/link';
import { useLang } from '@/lib/lang-context';

const TRANSLATIONS = {
  pt: { activeAds: 'anúncios ativos' },
  es: { activeAds: 'anuncios activos' },
} as const;

export function TopSellersSection({ topSellers }: { topSellers: any[] }) {
  const { lang, t } = useLang();
  const tt = TRANSLATIONS[lang as 'pt' | 'es'];

  return (
    <section className="section" aria-labelledby="top-sellers-heading" style={{ background: '#f8fafc' }}>
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-label">{t('top_sellers_label')}</div>
            <h2 className="section-title" id="top-sellers-heading">{t('top_sellers')}</h2>
          </div>
          <Link href="/listagem" className="view-all">
            <span>{t('view_all')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
        {!topSellers || topSellers.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0' }}>{t('top_sellers_empty')}</p>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {topSellers.map((seller: any, index: number) => (
            <Link key={seller.id} href={`/vendedor/${seller.slug}`} className="top-seller-card glass-card">
              <div className="seller-rank">#{index + 1}</div>
              {seller.avatar_url ? (
                // <img> comum, não next/image: avatar_url é livre (qualquer host que o
                // usuário tenha salvo), e next/image lança e derruba a página inteira via
                // error boundary quando o host não está em next.config.ts remotePatterns —
                // mesmo padrão já usado em AdSidebar.tsx/admin/usuarios para este caso.
                <img src={seller.avatar_url} alt={seller.name} width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--clr-primary-mid), var(--clr-primary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.2rem', flexShrink: 0, boxShadow: 'var(--shadow-green)' }}>
                  {seller.name?.substring(0, 2).toUpperCase() || 'US'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seller.name}</div>
                  {seller.verified && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--clr-primary-light)" stroke="white" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <polygon points="12 2 15.09 5.09 19.5 5 19.5 9.41 22.59 12.5 19.5 15.59 19.5 20 15.09 19.91 12 23 8.91 19.91 4.5 20 4.5 15.59 1.41 12.5 4.5 9.41 4.5 5 8.91 5.09 12 2"></polygon>
                      <polyline points="9 12.5 11 14.5 15.5 9" stroke="white" strokeWidth="3" fill="none"></polyline>
                    </svg>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', fontSize: '0.85rem' }}>
                  <span style={{ color: '#64748b' }}>{seller.active_ads || 0} {tt.activeAds}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
