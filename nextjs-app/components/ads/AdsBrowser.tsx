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
  const { lang } = useLang();
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
                    <nav aria-label="Breadcrumb" className="breadcrumb">
                      <a href="/">Início</a>
                      <span aria-hidden="true">›</span>
                      <span>{currentCatName || 'Todos os Anúncios'}</span>
                    </nav>
                  )}
                  <h1 className="list-hero-title">
                    {heroTitle || currentCatName || 'Todos os Anúncios'}
                  </h1>
                  <p className="list-hero-count">
                    {`${initialTotal} encontrados`}
                  </p>
                </div>
                <div className="list-sort-row" role="group" aria-label="Ordenação">
                  <label htmlFor="sort-select" className="sort-label">Ordenar:</label>
                  <select id="sort-select" className="sort-select" aria-label="Ordenar por"
                    value={ordem} onChange={e => { applyFilters({ ordem: e.target.value, page: 1 }); }}>
                    <option value="recent">Mais Recentes</option>
                    <option value="price_asc">Menor Preço</option>
                    <option value="price_desc">Maior Preço</option>
                    <option value="featured">Destaques Primeiro</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {children}

      <div className="container" style={{ paddingBlock: 'var(--sp-8) var(--sp-16)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-8)', alignItems: 'stretch' }}>
          {/* SIDEBAR */}
          <aside className="desktop-only" style={{ width: '280px', flexShrink: 0 }}>
            <div style={{ position: 'sticky', top: 'calc(var(--header-h) + var(--sp-8))' }}>
              <AdsSidebar />
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <ActiveFiltersList categories={categories} initialGeo={initialGeo} />
            
            <div style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: isPending ? 'none' : 'auto' }}>
              {initialAds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-16) var(--sp-8)', background: 'white', borderRadius: 'var(--r-xl)', border: '1px dashed var(--clr-border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '64px', height: '64px', background: 'var(--clr-bg-alt)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: 'var(--sp-4)', color: 'var(--clr-text-light)' }}>🔍</div>
                  <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--clr-text)', marginBottom: 'var(--sp-2)' }}>Nenhum anúncio encontrado</h3>
                  <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', maxWidth: '320px', marginBottom: 'var(--sp-6)' }}>Não encontramos resultados exatos para estes filtros. Tente expandir sua busca.</p>
                  <button onClick={clearFilters} className="btn btn--outline">Limpar Filtros</button>
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

        {/* FAB Filter Mobile */}
        <div className="mobile-only" style={{ position: 'fixed', bottom: 'var(--sp-6)', right: 'var(--sp-4)', zIndex: 90 }}>
          <button aria-label="Abrir filtros" aria-expanded="false" style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--clr-primary)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          </button>
        </div>
      </div>
      </main>
    </AdsFilterContext.Provider>
  );
}
