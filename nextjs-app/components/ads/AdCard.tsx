import Link from 'next/link';
import Image from 'next/image';
import { imageUrl } from '@/lib/storage';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';

export interface Category { id: string; name_pt: string; name_es: string; icon: string; color: string; active: boolean; sort_order: number; }
export interface Ad { id: string; title_pt: string; title_es: string; price: number; currency: string; price_unit_pt: string; price_unit_es?: string | null; negotiable: boolean; country: string; state: string; city: string; location_text: string; images: string[]; tags_pt: string[]; tags_es?: string[] | null; status: string; featured: boolean; created_at: string; category_id: string; }

export const COUNTRY_FLAGS: Record<string, string> = {
  'Brasil': '🇧🇷', 'Uruguai': '🇺🇾', 'Argentina': '🇦🇷',
  'Paraguai': '🇵🇾', 'Chile': '🇨🇱', 'Colômbia': '🇨🇴',
  'Peru': '🇵🇪', 'Bolívia': '🇧🇴', 'Venezuela': '🇻🇪',
  'Equador': '🇪🇨', 'Estados Unidos': '🇺🇸', 'Portugal': '🇵🇹'
};

const TRANSLATIONS = {
  pt: {
    today: 'Hoje', yesterday: 'Ontem',
    daysAgo: (d: number) => `${d} dias atrás`,
    priceOnRequest: 'Sob consulta',
    viewAd: (title: string) => `Ver anúncio: ${title}`,
    removeFav: 'Remover dos favoritos', addFav: 'Adicionar aos favoritos',
    negotiable: 'Negociável',
  },
  es: {
    today: 'Hoy', yesterday: 'Ayer',
    daysAgo: (d: number) => `Hace ${d} días`,
    priceOnRequest: 'A consultar',
    viewAd: (title: string) => `Ver anuncio: ${title}`,
    removeFav: 'Quitar de favoritos', addFav: 'Agregar a favoritos',
    negotiable: 'Negociable',
  }
};

// BUG CORRIGIDO (validação do zero, rodada 6): símbolo de moeda via
// Intl.NumberFormat variava com o locale de exibição — es-AR não tem
// símbolo de BRL no CLDR, mostrava "BRL 160.000,00" cru em vez de "R$
// 160.000,00" em /listagem para usuários em espanhol (ver lib/currency.ts).
function fmtPrice(price: number, currency = 'BRL', lang = 'pt') {
  return `${getCurrencySymbol(currency)} ${formatCurrencyAmount(price, lang === 'es' ? 'es' : 'pt')}`;
}

function timeAgo(iso: string, lang: string) {
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return T.today;
  if (d === 1) return T.yesterday;
  if (d < 30) return T.daysAgo(d);
  return new Date(iso).toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR');
}

interface AdCardProps {
  ad: Ad;
  categories: Category[];
  lang: string;
  isFav: boolean;
  onToggleFav: (id: string) => void;
  priority?: boolean;
}

export default function AdCard({ ad, categories, lang, isFav, onToggleFav, priority = false }: AdCardProps) {
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const title = lang === 'es' ? (ad.title_es || ad.title_pt) : ad.title_pt;
  const priceUnit = lang === 'es' && ad.price_unit_es ? ad.price_unit_es : ad.price_unit_pt;
  const tags = lang === 'es' && ad.tags_es && ad.tags_es.length > 0 ? ad.tags_es : ad.tags_pt;
  // imageUrl() já garante que qualquer host externo aqui está na allowlist
  // de next.config.ts (ou cai no fallback local) — não precisa mais marcar
  // toda URL http(s) como unoptimized só pra evitar o next/image travar em
  // host não configurado.
  const imgSrc = imageUrl(ad.images?.[0]);
  const locParts = [ad.city, ad.state].filter(Boolean).join(', ');
  const flag = ad.country ? (COUNTRY_FLAGS[ad.country] || '🌎') : '';
  const loc = ad.location_text || [locParts, flag && `${flag} ${ad.country}`].filter(Boolean).join(' — ');
  const cat = categories.find(c => c.id === ad.category_id);
  const catName = cat ? (lang === 'es' ? cat.name_es : cat.name_pt) : '';

  return (
    <article className={`ad-card fade-in-up${ad.featured ? ' ad-card--featured' : ''}`}>
      <Link href={`/anuncio/${ad.id}`} className="ad-card__link-overlay" aria-label={T.viewAd(title)} />
      
      <div className="ad-card__image">
        <Image 
          src={imgSrc} 
          alt={title} 
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={priority}
          unoptimized={imgSrc.includes('hero_farm.webp')}
        />
        {catName && (
          <div className="ad-card__category-badge" style={{ background: cat?.color || 'var(--clr-primary)', color: 'white' }}>
            {catName}
          </div>
        )}
        <button 
          className={`ad-card__fav ${isFav ? 'active' : ''}`} 
          aria-label={isFav ? T.removeFav : T.addFav}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav(ad.id); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div className="ad-card__body">
        <h3 className="ad-card__title">
          <Link href={`/anuncio/${ad.id}`} className="ad-card__title-link">{title}</Link>
        </h3>
        <div className="ad-card__price">
          {ad.price != null ? fmtPrice(ad.price, ad.currency || 'BRL', lang) : T.priceOnRequest}
          {priceUnit && <small>/ {priceUnit}</small>}
        </div>
        {tags?.length > 0 && (
          <div className="ad-card__tags">
            {tags.slice(0, 2).map((tag, i) => <span key={i} className="ad-tag">{tag}</span>)}
            {ad.negotiable && <span className="ad-tag ad-tag--success">{T.negotiable}</span>}
          </div>
        )}
        <div className="ad-card__meta">
          <div className="ad-card__location">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>{loc}</span>
          </div>
          <span className="ad-card__time">{timeAgo(ad.created_at, lang)}</span>
        </div>
      </div>
    </article>
  );
}
