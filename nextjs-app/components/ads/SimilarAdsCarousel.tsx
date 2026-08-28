'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { imageUrl } from '@/lib/storage';
import { useLang } from '@/lib/lang-context';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';

// BUG CORRIGIDO (validação do zero, rodada 6): componente inteiro (título da
// seção, aria-labels de navegação, "Sem título", "Sob consulta", badge de
// destaque, price_unit) ficava fixo em português mesmo com ES selecionado —
// nunca importava useLang(). Mesmo padrão local já usado em outros
// componentes de anúncio (ex.: components/ads/AdCard.tsx).
const TRANSLATIONS = {
  pt: {
    similarAds: 'Anúncios Similares',
    scrollLeft: 'Rolar para esquerda',
    scrollRight: 'Rolar para direita',
    noTitle: 'Sem título',
    priceOnRequest: 'Sob consulta',
    featured: 'Destaque',
  },
  es: {
    similarAds: 'Anuncios Similares',
    scrollLeft: 'Desplazar a la izquierda',
    scrollRight: 'Desplazar a la derecha',
    noTitle: 'Sin título',
    priceOnRequest: 'A consultar',
    featured: 'Destacado',
  },
};

export function SimilarAdsCarousel({ ads }: { ads: any[] }) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;

  if (!ads || ads.length === 0) return null;

  return (
    <div className="similar-ads-section" style={{ marginTop: '2rem', borderTop: 'none', paddingTop: 0 }}>
      <div className="carousel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{T.similarAds}</h3>
        <div className="carousel-controls" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn-carousel"
            onClick={() => carouselRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
            aria-label={T.scrollLeft}
            style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--clr-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            className="btn-carousel"
            onClick={() => carouselRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
            aria-label={T.scrollRight}
            style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--clr-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div 
        className="similar-ads-carousel" 
        ref={carouselRef}
        style={{ 
          display: 'flex', 
          gap: '1.5rem', 
          overflowX: 'auto', 
          paddingBottom: '1rem',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none', // Firefox
          WebkitOverflowScrolling: 'touch' // iOS
        }}
      >
        {ads.map(ad => {
          const title = (lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt) || T.noTitle;
          const priceUnit = lang === 'es' && ad.price_unit_es ? ad.price_unit_es : ad.price_unit_pt;
          const img = imageUrl(ad.images?.[0]);
          const locParts = [ad.city, ad.state].filter(Boolean).join(', ');
          
          return (
            <Link
              key={ad.id}
              href={`/anuncio/${ad.id}`}
              className="ad-card fade-in-up"
              style={{ 
                display: 'flex', 
                flexDirection: 'column',
                minWidth: 240, 
                maxWidth: 280, 
                flexShrink: 0, 
                textDecoration: 'none',
                background: 'var(--clr-surface)',
                borderRadius: '1rem',
                overflow: 'hidden',
                border: '1px solid var(--clr-border)',
                transition: 'transform 0.2s',
                scrollSnapAlign: 'start'
              }}
            >
              <div className="ad-card__image" style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
                <Image 
                  src={img} 
                  alt={title} 
                  fill
                  sizes="280px"
                  style={{ objectFit: 'cover' }} 
                />
                {ad.featured && (
                  <div className="ad-card__category-badge" style={{ position: 'absolute', top: '0.5rem', bottom: 'auto', left: '0.5rem', background: 'var(--clr-accent)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600, zIndex: 2 }}>
                    ⭐ {T.featured}
                  </div>
                )}
              </div>
              <div className="ad-card__body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 className="ad-card__title" style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--clr-text)', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {title}
                </h3>
                <div className="ad-card__price" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--clr-primary)', marginTop: 'auto', marginBottom: '0.5rem' }}>
                  {ad.price != null
                    ? `${getCurrencySymbol(ad.currency)} ${formatCurrencyAmount(ad.price, lang === 'es' ? 'es' : 'pt', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : T.priceOnRequest}
                  {priceUnit && <small style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', fontWeight: 400 }}> / {priceUnit}</small>}
                </div>
                {locParts && (
                  <div className="ad-card__meta" style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <MapPin className="w-3 h-3" />
                    <span>{locParts}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
