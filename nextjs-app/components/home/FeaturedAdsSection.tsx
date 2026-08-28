'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useLang } from '@/lib/lang-context';
import { useFavorites } from '@/lib/useFavorites';
import { AdCardHome } from './AdCardHome';

const TRANSLATIONS = {
  pt: {
    gridAria: 'Anúncios em destaque',
    empty: 'Nenhum anúncio destacado encontrado no momento.',
    emptyCta: 'Anuncie e ganhe destaque!',
  },
  es: {
    gridAria: 'Anuncios destacados',
    empty: 'Ningún anuncio destacado encontrado por el momento.',
    emptyCta: '¡Publica y gana destaque!',
  },
} as const;

export function FeaturedAdsSection({ featuredAds }: { featuredAds: any[] }) {
  const { lang, t } = useLang();
  const { favs, toggleFav } = useFavorites();
  const tt = TRANSLATIONS[lang as 'pt' | 'es'];

  return (
    <section className="section" aria-labelledby="featured-heading">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-label">{t('section_featured')}</div>
            <h2 className="section-title" id="featured-heading">{t('section_featured_title')}</h2>
          </div>
          <Link href="/listagem?destaque=true" className="view-all">
            <span>{t('view_all')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
        <LazyMotion features={domAnimation}>
          <div className="ads-grid" id="featured-ads" role="list" aria-label={tt.gridAria}>
            {featuredAds.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: 'white', borderRadius: 16, border: '1px dashed var(--clr-border)' }}>
                <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1rem' }}>{tt.empty}</p>
                <Link href="/login?mode=register" className="btn btn--primary">{tt.emptyCta}</Link>
              </div>
            ) : (
              featuredAds.slice(0, 4).map((ad: any, index: number) => (
                <AdCardHome key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} priority={index === 0} />
              ))
            )}
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
