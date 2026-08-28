'use client';

import { Ad, Category } from '@/components/ads/AdCard';
import AdsSidebar from '@/components/ads/AdsSidebar';
import { AdsFilterContext } from '@/components/ads/AdsFilterContext';
import { useAdsFilters } from '@/lib/useAdsFilters';
import { useGeoCascading } from '@/lib/useGeoCascading';
import { useLang } from '@/lib/lang-context';
import ActiveFiltersList from './ActiveFiltersList';
import AdsGrid from './AdsGrid';
import ListagemPagination from './ListagemPagination';

const TRANSLATIONS = {
  pt: {
    allAds: 'Todos os Anúncios',
    sortGroupAria: 'Ordenação',
    sortLabel: 'Ordenar:',
    sortAria: 'Ordenar por',
    sortRecent: 'Mais Recentes',
    sortPriceAsc: 'Menor Preço',
    sortPriceDesc: 'Maior Preço',
    sortFeatured: 'Destaques Primeiro',
    found: 'encontrados',
    emptyTitle: 'Nenhum anúncio encontrado',
    emptyDesc: 'Não encontramos resultados exatos para estes filtros. Que tal ajustar as categorias ou remover o filtro de localização?',
    emptyBtn: 'Limpar Filtros e Tentar Novamente',
  },
  es: {
    allAds: 'Todos los Anuncios',
    sortGroupAria: 'Ordenar',
    sortLabel: 'Ordenar:',
    sortAria: 'Ordenar por',
    sortRecent: 'Más Recientes',
    sortPriceAsc: 'Menor Precio',
    sortPriceDesc: 'Mayor Precio',
    sortFeatured: 'Destacados Primero',
    found: 'encontrados',
    emptyTitle: 'Ningún anuncio encontrado',
    emptyDesc: 'No encontramos resultados exactos para estos filtros. ¿Qué tal ajustar las categorías o quitar el filtro de ubicación?',
    emptyBtn: 'Limpiar Filtros e Intentar de Nuevo',
  }
};

export default function AdsBrowser({
  initialAds = [], 
  initialTotal = 0, 
  initialGeo,
  categories = [],
  sellerId,
  hideHero,
  heroTitle,
  hideHeroBreadcrumb,
  children
}: { 
  initialAds?: Ad[], 
  initialTotal?: number, 
  initialGeo?: { pais: string | null; estado: string | null; cidade: string | null },
  categories?: Category[],
  sellerId?: string,
  hideHero?: boolean,
  heroTitle?: string,
  hideHeroBreadcrumb?: boolean,
  nextCursor?: string,
  children?: React.ReactNode
}) {
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const filtersHook = useAdsFilters(initialGeo);
  
  const {
    busca, setBusca,
    categoria, setCategoria,
    pais, setPais,
    estado, setEstado,
    cidade, setCidade,
    precoMin, setPrecoMin, precoMax, setPrecoMax, setPrice,
    ordem, setOrdem,
    destaque, setDestaque,
    negociavel, setNegociavel,
    page, setPage,
    hasFilters,
    applyFilters,
    clearFilters,
    handleSearch,
    isPending
  } = filtersHook;

  const { countries, states, cities } = useGeoCascading(pais, estado, categoria);

  const PAGE_SIZE = 24;
  const hasMore = initialAds.length === PAGE_SIZE;

  const contextValue = {
    lang, categories,
    countries, states: states.map(s => s.id), cities,
    hasFilters, clearFilters, applyFilters, handleSearch,
    busca, categoria, setCategoria,
    pais, setPais, estado, setEstado, cidade, setCidade,
    precoMin, setPrecoMin, precoMax, setPrecoMax, setPrice,
    destaque, setDestaque, negociavel, setNegociavel
  };

  const currentCatName = categoria ? (categories.find(c => c.id === categoria)?.[lang === 'es' ? 'name_es' : 'name_pt'] || categoria) : '';

  return (
    <AdsFilterContext.Provider value={contextValue}>
      <main className="flex-1 flex flex-col" style={{ marginTop: 'var(--header-h)' }}>
        {/* HEADER SECTION */}
        {!hideHero && (
          <div className="list-hero">
            <div className="container">
              <div className="list-hero-inner">
                <div>
                  {!hideHeroBreadcrumb && (
                    <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
                      <a href="/">{t('nav_home')}</a>
                      <span aria-hidden="true">›</span>
                      <span>{currentCatName || T.allAds}</span>
                    </nav>
                  )}
                  <h1 className="list-hero-title">
                    {heroTitle || currentCatName || T.allAds}
                  </h1>
                  <p className="list-hero-count">
                    {`${initialTotal} ${T.found}`}
                  </p>
                </div>
                <div className="list-sort-row" role="group" aria-label={T.sortGroupAria}>
                  <label htmlFor="sort-select" className="sort-label">{T.sortLabel}</label>
                  <select id="sort-select" className="sort-select" aria-label={T.sortAria}
                    value={ordem} onChange={e => { applyFilters({ ordem: e.target.value, page: 1 }); }}>
                    <option value="recent">{T.sortRecent}</option>
                    <option value="price_asc">{T.sortPriceAsc}</option>
                    <option value="price_desc">{T.sortPriceDesc}</option>
                    <option value="featured">{T.sortFeatured}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {children}

      <div className="container" style={{ paddingBlock: hideHero ? 'var(--sp-4) var(--sp-16)' : 'var(--sp-8) var(--sp-16)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-8)', alignItems: 'stretch' }}>
          {/* SIDEBAR — AdsSidebar já é responsivo por conta própria (o
              width/sticky do desktop mora em .ads-sidebar-desktop, no
              CSS global; o FAB/drawer mobile são position:fixed, saem do
              fluxo normal). Sem wrapper aqui — um <aside> externo
              escondendo isso no mobile esconderia o FAB/drawer junto. */}
          <AdsSidebar />

          {/* MAIN CONTENT */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* BUG CRÍTICO CORRIGIDO (reteste do site, 2026-08-25): useAutoGeo
                (chamado dentro de ActiveFiltersList) aplica a geolocalização
                DO VISITANTE como filtro sempre que não há localização manual —
                certo para /listagem ("perto de você"), errado na página de um
                vendedor específico (AdsBrowser com sellerId): escondia TODOS
                os anúncios de um vendedor sempre que o visitante estivesse
                fora da cidade detectada dele, mesmo o vendedor tendo
                anúncios ativos reais em outro lugar. */}
            <ActiveFiltersList categories={categories} initialGeo={initialGeo} disableAutoGeo={!!sellerId} />
            
            <div style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: isPending ? 'none' : 'auto' }}>
              {initialAds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-20) var(--sp-8)', background: 'var(--clr-surface)', borderRadius: 'var(--r-2xl)', border: '1px dashed var(--clr-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '80px', height: '80px', background: 'var(--clr-primary-pale)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: 'var(--sp-6)', color: 'var(--clr-primary)', boxShadow: '0 0 0 10px rgba(34,197,94,0.05)' }}>🔍</div>
                  <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--clr-text)', marginBottom: 'var(--sp-2)', letterSpacing: '-0.02em' }}>{T.emptyTitle}</h3>
                  <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-base)', maxWidth: '360px', marginBottom: 'var(--sp-8)', lineHeight: 1.6 }}>{T.emptyDesc}</p>
                  <button onClick={clearFilters} className="btn btn--primary" style={{ padding: '12px 32px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    <span>{T.emptyBtn}</span>
                  </button>
                </div>
              ) : (
                <>
                  <AdsGrid ads={initialAds} categories={categories} />
                  <ListagemPagination hasMore={hasMore} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </main>
    </AdsFilterContext.Provider>
  );
}
