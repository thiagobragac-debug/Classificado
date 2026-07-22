'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/lang-context';
import { showToast } from '@/lib/toast';
import { CATEGORIES, CAT_COLORS, CAT_SVG_PATHS, POPULAR_TAGS, TRUST_ITEMS } from '@/lib/constants';
import { useScrollReveal } from '@/lib/use-scroll-reveal';
import { useFavorites } from '@/lib/useFavorites';
import { useRecentViews } from '@/lib/useRecentViews';
import { AdBanner } from '@/components/AdBanner';
import { useAuth } from '@/components/AuthProvider';
import { getAds } from '@/lib/supabase';

const POPULAR = {
  pt: ['nelore', 'angus', 'trator', 'fazenda', 'soja', 'milho', 'garrote', 'novilha', 'cavalo', 'suíno'],
  es: ['nelore', 'angus', 'tractor', 'estancia', 'soja', 'maíz', 'novillo', 'vaquillona', 'caballo', 'porcino'],
};

const LOCATIONS = [
  { name: 'Brasil', flag: '🇧🇷', id: 'BR' },
  { name: 'Paraguai', flag: '🇵🇾', id: 'PY' },
  { name: 'Argentina', flag: '🇦🇷', id: 'AR' },
  { name: 'Uruguai', flag: '🇺🇾', id: 'UY' },
  { name: 'Mato Grosso', flag: '📍', id: 'MT' },
  { name: 'Goiás', flag: '📍', id: 'GO' },
  { name: 'Mato Grosso do Sul', flag: '📍', id: 'MS' },
  { name: 'São Paulo', flag: '📍', id: 'SP' },
];

// ─── HELPERS ─────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatPrice(price: number | null, currency = 'BRL', lang: string): string {
  if (!price || price === 0) return lang === 'es' ? 'Consultar' : 'Consultar';
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'pt-BR', {
      style: 'currency', currency, maximumFractionDigits: 0
    }).format(price);
  } catch {
    return `R$ ${price.toLocaleString('pt-BR')}`;
  }
}

// ─── AD CARD ────────────────────────────────────────────────────

function AdCard({ ad, lang, favs, toggleFav }: { ad: any; lang: string; favs: Record<string, boolean>; toggleFav: (id: string) => void }) {
  const cat = ad.category_id?.replace('cat-', '') || '';
  const colors = CAT_COLORS[cat] || { bg: '#F8FAFC', clr: '#475569' };
  const img = ad.images?.[0];
  const isFav = !!favs[ad.id];

  return (
    <Link href={`/anuncio/${ad.id}`} className={`ad-card${ad.featured ? ' ad-card--featured' : ''}`}>
      <div className="ad-card__image">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={ad.title_pt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            🌿
          </div>
        )}
        {/* Favorite button */}
        <button
          className={`ad-card__fav ${isFav ? 'active' : ''}`}
          aria-label="Favoritar"
          onClick={(e) => { e.preventDefault(); toggleFav(ad.id); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        {/* Category badge */}
        {cat && (
          <div
            className="ad-card__category-badge"
            style={{ background: colors.bg, color: colors.clr }}
          >
            {CATEGORIES.find(c => c.id === cat)?.[lang === 'es' ? 'name_es' : 'name_pt'] || cat}
          </div>
        )}
      </div>
      <div className="ad-card__body">
        <p className="ad-card__title">{lang === 'es' && ad.title_es ? ad.title_es : (ad.title_pt || 'Sem título')}</p>
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
          <span className="ad-card__time">{formatRelativeTime(ad.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── ANIMATED COUNTER ───────────────────────────────────────────

function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const dur = 1500;
      const step = (timestamp: number) => {
        if (!start) start = timestamp;
        const prog = Math.min((timestamp - start) / dur, 1);
        const ease = 1 - Math.pow(1 - prog, 3);
        setVal(Math.round(ease * target));
        if (prog < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);

  const display = val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : String(val);
  return <span ref={ref}>{display}{suffix}</span>;
}

// ─── HOME PAGE ───────────────────────────────────────────────────

export default function HomeClient({ initialFeatured, initialRecent, initialHasMore, stats, topSellers, testimonials }: any) {
  return (
    <Suspense fallback={<div style={{ padding: '20vh', textAlign: 'center' }}>Carregando...</div>}>
      <HomeContentInner 
        initialFeatured={initialFeatured} 
        initialRecent={initialRecent} 
        initialHasMore={initialHasMore} 
        stats={stats} 
        topSellers={topSellers}
        testimonials={testimonials}
      />
    </Suspense>
  )
}

function HomeContentInner({ initialFeatured, initialRecent, initialHasMore, stats, topSellers, testimonials }: any) {
  const { lang, t } = useLang();
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Show logout toast
  useEffect(() => {
    if (searchParams.get('logout') === 'success') {
      showToast('Você foi desconectado com segurança.', 'success');
      router.replace('/');
    }
  }, [searchParams, router]);

  useScrollReveal();
  const { favs, toggleFav } = useFavorites();
  const { recentViews } = useRecentViews();
  const [featuredAds, setFeaturedAds] = useState<any[]>(initialFeatured || []);
  const [recentAds, setRecentAds]   = useState<any[]>(initialRecent || []);
  const [platformStats, setPlatformStats] = useState<any>(stats || null);
  const [search, setSearch]         = useState('');
  const [catSelect, setCatSelect]   = useState('');
  const [recentPage, setRecentPage] = useState(1);
  const [hasMore, setHasMore]       = useState(initialHasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialLoading = false; // Always false since we have initial SSR data


  const loadMoreRecent = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = recentPage + 1;
      const { ads, hasMore: more } = await getAds({ limit: 12, page: next });
      setRecentAds(prev => [...prev, ...ads]);
      setHasMore(more ?? false);
      setRecentPage(next);
    } finally {
      setLoadingMore(false);
    }
  }, [recentPage, loadingMore]);

  const [showAuto, setShowAuto]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAuto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(search);

  const matchedCats = q ? CATEGORIES.filter(c => norm(lang === 'es' ? c.name_es : c.name_pt).includes(q)) : [];
  const matchedLocs = q ? LOCATIONS.filter(l => norm(l.name).includes(q)) : [];
  const popular = (POPULAR[lang as 'pt' | 'es'] || POPULAR.pt).filter(p => p.includes(q) && p !== q).slice(0, 4);

  const doSearch = (termOverride?: string, catOverride?: string) => {
    setShowAuto(false);
    const finalTerm = termOverride !== undefined ? termOverride : search;
    const finalCat = catOverride !== undefined ? catOverride : catSelect;
    const params = new URLSearchParams();
    if (finalTerm) params.set('busca', finalTerm);
    if (finalCat) params.set('cat', finalCat);
    router.push(`/listagem?${params.toString()}`);
  };

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="hero" aria-labelledby="hero-heading">
        <div className="container">
          <div className="hero-grid">

            {/* LEFT */}
            <div className="hero-left fade-in-up visible">
              <div className="hero-badge" aria-label="Cobertura Mercosul">
                <span className="hero-badge-dot" aria-hidden="true"></span>
                <span>{t('hero_badge')}</span>
              </div>

              <h1 className="hero-h1" id="hero-heading">
                <span>{t('hero_title')}</span>
                <span className="grad"> {t('hero_highlight')}</span><br />
                <span>{t('hero_title2')}</span>
              </h1>

              <p className="hero-sub">{t('hero_sub')}</p>

              {/* Search Box */}
              <div ref={searchRef} className="hero-search-box" role="search" aria-label="Busca principal" style={{ position: 'relative' }}>
                <div className="hero-search-inner">
                  <select
                    id="hero-category-select"
                    aria-label="Categoria"
                    value={catSelect}
                    onChange={(e) => setCatSelect(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {lang === 'es' ? c.name_es : c.name_pt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="search"
                    id="hero-search-input"
                    placeholder={t('search_placeholder')}
                    aria-label="Termo de busca"
                    value={search}
                    onFocus={() => setShowAuto(true)}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShowAuto(true);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  />
                  <button className="hero-search-btn" onClick={() => doSearch()} aria-label="Buscar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <span>{t('search_btn')}</span>
                  </button>
                </div>

                {/* Autocomplete Dropdown */}
                {showAuto && (search.length > 1 || popular.length > 0) && (
                  <div className="search-autocomplete-dropdown" style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, 
                    background: 'white', borderRadius: '0 0 var(--r-xl) var(--r-xl)', 
                    marginTop: 4, zIndex: 50, 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    textAlign: 'left'
                  }}>
                    {matchedLocs.length > 0 && (
                      <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Locais</div>
                        {matchedLocs.map(l => (
                          <div key={l.id} onClick={() => { setSearch(l.name); doSearch(l.name); }} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
                            <span>{l.flag}</span> <span style={{ fontSize: '0.9rem' }}>{l.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {matchedCats.length > 0 && (
                      <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Categorias</div>
                        {matchedCats.map(c => (
                          <div key={c.id} onClick={() => doSearch('', c.id)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
                            <span style={{ fontSize: '0.9rem' }}>{lang === 'es' ? c.name_es : c.name_pt}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ padding: '8px 0' }}>
                      <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{search ? 'Sugestões' : 'Populares'}</div>
                      {popular.map(p => (
                        <div key={p} onClick={() => { setSearch(p); doSearch(p); }} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#334155' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          <span style={{ fontSize: '0.9rem' }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Popular Tags */}
              <div className="hero-popular-tags" aria-label="Buscas populares">
                <span style={{ flexShrink: 0 }}>{t('popular')}</span>
                <div id="popular-tags" style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flexWrap: 'nowrap' }}>
                  {(POPULAR_TAGS[lang as 'pt' | 'es'] || POPULAR_TAGS.pt).map((tag) => (
                    <button
                      key={tag}
                      className="tag-pill"
                      onClick={() => { setSearch(tag); doSearch(); }}
                    >{tag}</button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="hero-actions">
                <Link href="/anunciar" className="btn btn--accent btn--lg btn--shimmer" id="btn-post-hero">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>{t('btn_post_hero')}</span>
                </Link>
                <Link href="/listagem" className="hero-explore-link">
                  <span>{t('btn_explore')}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </Link>
              </div>

              {/* Mini Stats */}
              <div className="hero-mini-stats" aria-label="Estatísticas">
                {[
                  { id: 'stat-ads',     target: platformStats?.total_ads      ?? 2520, suffix: '+', lbl: t('stats_0') },
                  { id: 'stat-users',   target: platformStats?.total_sellers   ?? 450,  suffix: '+', lbl: t('stats_3') },
                  { id: 'stat-paises',  target: platformStats?.total_countries ?? 4,    suffix: '',  lbl: t('stats_2') },
                  { id: 'stat-cidades', target: platformStats?.total_cities    ?? 120,  suffix: '+', lbl: t('stats_1') },
                ].map(s => (
                  <div key={s.id} className="hero-mini-stat">
                    <span className="num" id={s.id}>
                      <AnimatedNumber target={s.target} suffix={s.suffix} />
                    </span>
                    <span className="lbl">{s.lbl}</span>
                  </div>
                ))}
              </div>
            </div>{/* /.hero-left */}

            {/* RIGHT */}
            <div className="hero-right fade-in-up visible" style={{ transitionDelay: '.15s' }}>
              <div className="hero-img-frame">

                <div className="hero-float-card hero-float-card--1" aria-hidden="true">
                  <div className="fc-icon fc-icon--green">🐄</div>
                  <div>
                    <div className="fc-text-main">
                      <AnimatedNumber target={platformStats?.total_bovinos ?? 18400} /> <span>{t('fc_bovinos')}</span>
                    </div>
                    <div className="fc-text-sub">{t('fc_ads_available')}</div>
                  </div>
                </div>

                <div className="hero-float-card hero-float-card--2" aria-hidden="true">
                  <div className="fc-icon fc-icon--amber">⭐</div>
                  <div>
                    <div className="fc-text-main">{t('fc_verified')}</div>
                    <div className="fc-text-sub">
                      <AnimatedNumber target={platformStats?.total_sellers ?? 450} suffix="+" /> <span>{t('fc_sellers')}</span>
                    </div>
                  </div>
                </div>

                <div className="hero-float-card hero-float-card--3" aria-hidden="true">
                  <div className="fc-icon" style={{ color: 'var(--clr-accent)' }}>🔨</div>
                  <div>
                    <div className="fc-text-main">
                      <AnimatedNumber target={platformStats?.total_auctions ?? 15} /> <span>{t('fc_auctions')}</span>
                    </div>
                    <div className="fc-text-sub">{t('fc_scheduled')}</div>
                  </div>
                </div>

                <div className="hero-float-card hero-float-card--4" aria-hidden="true">
                  <div className="fc-icon" style={{ color: 'var(--clr-primary)' }}>🚜</div>
                  <div>
                    <div className="fc-text-main">
                      <AnimatedNumber target={platformStats?.total_machines ?? 1200} /> <span>{t('fc_machines')}</span>
                    </div>
                    <div className="fc-text-sub">{t('fc_machines_sub')}</div>
                  </div>
                </div>

                {/* Main image */}
                <div className="hero-img-wrap">
                  <Image 
                    src="/assets/hero_farm.webp" 
                    alt="Fazenda no agronegócio do Mercosul — paisagem verde com gado" 
                    fill
                    priority
                    style={{ objectFit: 'cover' }}
                  />
                </div>

              </div>
            </div>{/* /.hero-right */}

          </div>{/* /.hero-grid */}
        </div>
      </section>

      <div className="container"><AdBanner position="home_top" /></div>

      {/* ─── CATEGORIES ───────────────────────────────────────────── */}
      <section className="section categories-section" id="categorias" aria-labelledby="cat-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-label">{t('section_cats')}</div>
              <h2 className="section-title" id="cat-heading">{t('section_cats_title')}</h2>
            </div>
            <Link href="/listagem" className="view-all" aria-label="Ver todos os anúncios">
              <span>{t('view_all')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
          <div className="cat-grid" id="cat-grid" role="list" aria-label="Categorias de anúncios">
            {CATEGORIES.map((cat) => {
              const colors = CAT_COLORS[cat.id] || { bg: '#F8FAFC', clr: '#475569' };
              const svgPath = CAT_SVG_PATHS[cat.icon] || CAT_SVG_PATHS.more;
              return (
                <Link
                  key={cat.id}
                  href={`/listagem?cat=${cat.id}`}
                  className="cat-card"
                  role="listitem"
                  style={{ borderColor: 'transparent' }}
                >
                  <div className="cat-icon" style={{ background: colors.bg }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={colors.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                      dangerouslySetInnerHTML={{ __html: svgPath }}
                    />
                  </div>
                  <span className="cat-name">{lang === 'es' ? cat.name_es : cat.name_pt}</span>
                  <span className="cat-count">{cat.count.toLocaleString('pt-BR')}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── FEATURED ADS ─────────────────────────────────────────── */}
      <section className="section" aria-labelledby="featured-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-label">{t('section_featured')}</div>
              <h2 className="section-title" id="featured-heading">{t('section_featured_title')}</h2>
            </div>
            <Link href="/listagem?featured=true" className="view-all">
              <span>{t('view_all')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
          <div className="ads-grid" id="featured-ads" role="list" aria-label="Anúncios em destaque">
            {initialLoading ? (
              // Skeleton screens enquanto carrega
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ad-card" style={{ minHeight: 280, background: 'var(--clr-bg-alt)' }}>
                  <div style={{ height: 160, background: '#e2e8f0', margin: '0 0 12px' }}></div>
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ height: 16, background: '#e2e8f0', borderRadius: 4, marginBottom: 8 }}></div>
                    <div style={{ height: 20, background: '#e2e8f0', borderRadius: 4, width: '60%' }}></div>
                  </div>
                </div>
              ))
            ) : featuredAds.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: 'white', borderRadius: 16, border: '1px dashed var(--clr-border)' }}>
                <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1rem' }}>Nenhum anúncio destacado encontrado no momento.</p>
                <Link href="/login?mode=register" className="btn btn--primary">Anuncie e ganhe destaque!</Link>
              </div>
            ) : (
              featuredAds.slice(0, 4).map(ad => (
                <AdCard key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* ─── TRUST ────────────────────────────────────────────────── */}
      <section className="section trust-section" aria-labelledby="trust-heading">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--sp-12)' }}>
            <div className="section-label" style={{ justifyContent: 'center', marginBottom: 'var(--sp-3)' }}>Por que escolher o Tauze Class</div>
            <h2 className="section-title" id="trust-heading" style={{ marginBottom: 'var(--sp-3)' }}>{t('trust_title')}</h2>
            <p className="section-subtitle" style={{ marginInline: 'auto', textAlign: 'center' }}>A plataforma mais confiável para negócios rurais no Mercosul.</p>
          </div>
          <div className="trust-grid" role="list">
            {TRUST_ITEMS.map((item, i) => (
              <div key={i} className="trust-item" role="listitem">
                <div className="trust-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    dangerouslySetInnerHTML={{ __html: item.icon }}
                  />
                </div>
                <div className="trust-title">{lang === 'es' ? item.title_es : item.title_pt}</div>
                <p className="trust-desc">{lang === 'es' ? item.desc_es : item.desc_pt}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TOP VENDEDORES ───────────────────────────────────────────── */}
      <section className="section" aria-labelledby="top-sellers-heading" style={{ background: '#f8fafc' }}>
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-label">Lojas de Destaque</div>
              <h2 className="section-title" id="top-sellers-heading">Top Vendedores</h2>
            </div>
            <Link href="/listagem" className="view-all">
              <span>Ver todos</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            {topSellers?.map((seller: any) => (
              <div key={seller.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}>
                {seller.avatar_url ? (
                  <img src={seller.avatar_url} alt={seller.name} style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: '#15803d', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.2rem', flexShrink: 0 }}>
                    {seller.name?.substring(0, 2).toUpperCase() || 'US'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seller.name}</div>
                    {seller.verified && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2" style={{ flexShrink: 0 }}>
                        <polygon points="12 2 15.09 5.09 19.5 5 19.5 9.41 22.59 12.5 19.5 15.59 19.5 20 15.09 19.91 12 23 8.91 19.91 4.5 20 4.5 15.59 1.41 12.5 4.5 9.41 4.5 5 8.91 5.09 12 2"></polygon>
                        <polyline points="9 12.5 11 14.5 15.5 9" stroke="white" strokeWidth="3" fill="none"></polyline>
                      </svg>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>{seller.active_ads || 0} anúncios ativos</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DEPOIMENTOS ───────────────────────────────────────────── */}
      <section className="section" aria-labelledby="testimonials-heading">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="section-label" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>Provas Sociais</div>
            <h2 className="section-title" id="testimonials-heading">Casos de Sucesso</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {testimonials?.map((testi: any) => (
              <div key={testi.id} style={{ background: '#fff', padding: '2rem', borderRadius: '1.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '2px', color: '#eab308', marginBottom: '1rem' }}>
                  {Array.from({ length: testi.rating || 5 }).map((_, i) => <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>)}
                </div>
                <p style={{ color: '#334155', fontSize: '1rem', lineHeight: 1.6, fontStyle: 'italic', flex: 1, marginBottom: '1.5rem' }}>"{testi.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 600 }}>{testi.author?.charAt(0) || 'U'}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{testi.author}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{testi.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MERCOSUL ─────────────────────────────────────────────── */}
      <section className="section mercosul-section" aria-labelledby="mercosul-heading">
        <div className="container">
          <div className="mercosul-grid">
            <div>
              <div className="section-label">{t('mercosul_label')}</div>
              <h2 className="section-title" id="mercosul-heading" style={{ marginBottom: 'var(--sp-4)' }}>{t('mercosul_title')}</h2>
              <p className="section-subtitle">{t('mercosul_sub')}</p>
              <div style={{ marginTop: 'var(--sp-8)' }}>
                <Link href="/listagem" className="btn btn--primary btn--lg">
                  <span>{t('btn_explore')}</span>
                </Link>
              </div>
            </div>
            <div className="country-cards" role="list" aria-label="Países cobertos">
              {[
                { name: 'Brasil',   flag: '/assets/flags/br.svg', alt: 'Brasil' },
                { name: 'Argentina',flag: '/assets/flags/ar.svg', alt: 'Argentina' },
                { name: 'Paraguai', flag: '/assets/flags/py.svg', alt: 'Paraguai' },
                { name: 'Uruguai',  flag: '/assets/flags/uy.svg', alt: 'Uruguai' },
              ].map((c) => (
                <div key={c.name} className="country-card" style={{ background: '#fff', padding: 'var(--sp-4) var(--sp-5)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', cursor: 'default' }}>
                  <img src={c.flag} alt={c.alt} width={42} height={42} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', flexShrink: 0 }} loading="lazy" />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '1.05rem' }}>{c.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', marginTop: 2 }}>Cobertura Nacional</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container"><AdBanner position="home_mid" /></div>

      {/* ─── RECENTLY VIEWED (Dynamic) ───────────────────────────── */}
      {recentViews.length > 0 && (
        <section className="section" style={{ paddingBottom: 0 }} aria-labelledby="recently-viewed-heading">
          <div className="container">
            <h2 className="section-title" id="recently-viewed-heading" style={{ marginBottom: '1.5rem' }}>
              {t('recently_viewed') || 'Vistos Recentemente'}
            </h2>
            <div className="ads-grid" style={{ marginBottom: '2.5rem' }}>
              {recentViews.map(ad => (
                <AdCard key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── RECENT ADS ───────────────────────────────────────────── */}
      <section className="section" style={{ background: 'var(--clr-bg-alt)' }} aria-labelledby="recent-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-label">{t('section_recent')}</div>
              <h2 className="section-title" id="recent-heading">{t('section_recent_title')}</h2>
            </div>
            <Link href="/listagem" className="view-all">
              <span>{t('view_all')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
          <div className="ads-grid" id="recent-ads" role="list" aria-label="Últimos anúncios publicados">
            {initialLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="ad-card" style={{ minHeight: 280, background: 'white' }}>
                  <div style={{ height: 160, background: '#e2e8f0', margin: '0 0 12px' }}></div>
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ height: 16, background: '#e2e8f0', borderRadius: 4, marginBottom: 8 }}></div>
                    <div style={{ height: 20, background: '#e2e8f0', borderRadius: 4, width: '60%' }}></div>
                  </div>
                </div>
              ))
            ) : recentAds.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: 'white', borderRadius: 16, border: '1px dashed var(--clr-border)' }}>
                <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1rem' }}>Nenhum anúncio recente encontrado.</p>
                <Link href="/login?mode=register" className="btn btn--primary">Seja o primeiro a anunciar!</Link>
              </div>
            ) : (
              recentAds.map(ad => (
                <AdCard key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} />
              ))
            )}
          </div>
          {hasMore && !initialLoading && (
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <button
                id="btn-load-more"
                onClick={loadMoreRecent}
                disabled={loadingMore}
                style={{ padding: '0.8rem 2rem', borderRadius: 99, background: 'white', border: '2px solid var(--clr-border)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', opacity: loadingMore ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {loadingMore && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                  </svg>
                )}
                {loadingMore ? 'Carregando...' : 'Carregar mais anúncios'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <section className="section cta-section" aria-labelledby="cta-heading">
        <div className="container">
          <div className="cta-inner">
            <div className="cta-text fade-in-up visible">
              <h2 id="cta-heading">{t('cta_title')}</h2>
              <p>{t('cta_sub')}</p>
            </div>
            <div className="cta-actions fade-in-up visible">
              {session ? (
                <Link href="/painel" className="btn btn--accent btn--shimmer">{lang === 'es' ? 'Ir al Panel' : 'Ir para o Painel'}</Link>
              ) : (
                <Link href="/login?mode=register" className="btn btn--accent btn--shimmer">{t('btn_free')}</Link>
              )}
              <a href="#" className="btn btn--ghost">{t('btn_know')}</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
