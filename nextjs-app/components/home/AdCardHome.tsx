'use client';

import Link from 'next/link';
import Image from 'next/image';
import { m } from 'framer-motion';
import { CAT_COLORS } from '@/lib/constants';
import { useCategories } from '@/lib/categories-context';
import { imageUrl } from '@/lib/storage';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';

const TRANSLATIONS = {
  pt: { now: 'agora', favorite: 'Favoritar', noTitle: 'Sem título' },
  es: { now: 'ahora', favorite: 'Marcar como favorito', noTitle: 'Sin título' },
} as const;

function formatRelativeTime(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return TRANSLATIONS[lang === 'es' ? 'es' : 'pt'].now;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const NO_PRICE_LABEL: Record<string, string> = { pt: 'Consultar', es: 'A tratar' };

// BUG CORRIGIDO (validação do zero, rodada 6): símbolo de moeda via
// Intl.NumberFormat variava com o locale de exibição — es-AR não tem
// símbolo de BRL no CLDR, mostrava "BRL 160.000" cru em vez de "R$
// 160.000" (ver lib/currency.ts).
function formatPrice(price: number | null, currency = 'BRL', lang: string): string {
  if (!price || price === 0) return NO_PRICE_LABEL[lang] ?? 'Consultar';
  const langCode = lang === 'es' ? 'es' : 'pt';
  return `${getCurrencySymbol(currency)} ${formatCurrencyAmount(price, langCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function AdCardHome({ ad, lang, favs, toggleFav, priority = false }: { ad: any; lang: string; favs: Record<string, boolean>; toggleFav: (id: string) => void; priority?: boolean }) {
  const categories = useCategories();
  const cat = ad.category_id?.replace('cat-', '') || '';
  const colors = CAT_COLORS[cat] || { bg: '#F8FAFC', clr: '#475569' };
  const img = ad.images?.[0] ? imageUrl(ad.images[0], '') : '';
  const isFav = !!favs[ad.id];
  const tt = TRANSLATIONS[lang === 'es' ? 'es' : 'pt'];
  const adTitle = lang === 'es' && ad.title_es ? ad.title_es : (ad.title_pt || tt.noTitle);

  return (
    <m.div
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Link href={`/anuncio/${ad.slug}`} className={`ad-card${ad.featured ? ' ad-card--featured' : ''}`} style={{ flex: 1, width: '100%' }}>
      <div className="ad-card__image" style={{ position: 'relative' }}>
        {img ? (
          <Image src={img} alt={adTitle} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 300px" priority={priority} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            🌿
          </div>
        )}
        {/* Favorite button */}
        <button
          className={`ad-card__fav ${isFav ? 'active' : ''}`}
          aria-label={tt.favorite}
          onClick={(e) => { e.preventDefault(); toggleFav(ad.id); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        {cat && (
          <div
            className="ad-card__category-badge"
            style={{ background: colors.bg, color: colors.clr }}
          >
            {categories.find((c: any) => c.id === cat)?.[lang === 'es' ? 'name_es' : 'name_pt'] || categories.find((c: any) => c.id === cat)?.name_pt || cat}
          </div>
        )}
      </div>
      <div className="ad-card__body">
        <p className="ad-card__title">{adTitle}</p>
        <div className="ad-card__price">
          {formatPrice(ad.price, ad.currency, lang)}
        </div>
        <div className="ad-card__meta">
          <div className="ad-card__location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>{[ad.city, ad.state].filter(Boolean).join(', ') || '—'}</span>
          </div>
          <span className="ad-card__time" suppressHydrationWarning>{formatRelativeTime(ad.created_at, lang)}</span>
        </div>
      </div>
    </Link>
    </m.div>
  );
}
