'use client';

import { useEffect, useState } from 'react';
import { Ad, Category } from '@/components/ads/AdCard';
import AdsSidebar from '@/components/ads/AdsSidebar';
import { AdsFilterContext } from '@/components/ads/AdsFilterContext';
import { useAdsFilters } from '@/lib/useAdsFilters';
import { useGeoCascading } from '@/lib/useGeoCascading';
import { clearGeoCache } from '@/lib/useGeoLocation';
import { buildGeoFallbackMessage, type GeoFallbackInfo } from '@/lib/geo-cascade';
import { useLang } from '@/lib/lang-context';
import { getSupabase } from '@/lib/supabase';
import { getPurposeOptions } from '@/lib/purposeOptions';
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
    emptyBtnRemove: (label: string) => `Remover filtro de ${label}`,
    emptyBtnClearAll: 'Ou limpar todos os filtros',
    priceRangeLabel: 'faixa de preço',
    unknownFilterLabel: 'este filtro',
    emptyOverflowTitle: 'Página além do fim da lista',
    emptyOverflowDesc: (total: number, totalPages: number) => `Só encontramos ${total} anúncio${total === 1 ? '' : 's'} pra estes filtros (${totalPages} página${totalPages === 1 ? '' : 's'}). Volte pra uma página válida abaixo.`,
    emptyOverflowBackBtn: (totalPages: number) => `Voltar para a página ${totalPages}`,
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
    emptyBtnRemove: (label: string) => `Quitar filtro de ${label}`,
    emptyBtnClearAll: 'O limpiar todos los filtros',
    priceRangeLabel: 'rango de precio',
    unknownFilterLabel: 'este filtro',
    emptyOverflowTitle: 'Página más allá del final de la lista',
    emptyOverflowDesc: (total: number, totalPages: number) => `Solo encontramos ${total} anuncio${total === 1 ? '' : 's'} para estos filtros (${totalPages} página${totalPages === 1 ? '' : 's'}). Volvé a una página válida abajo.`,
    emptyOverflowBackBtn: (totalPages: number) => `Volver a la página ${totalPages}`,
  }
};

export default function AdsBrowser({
  initialAds = [],
  initialTotal = 0,
  initialGeo,
  geoFallback,
  categories = [],
  sellerId,
  hideHero,
  heroTitle,
  hideHeroBreadcrumb,
  effectiveCategoria,
  children
}: {
  initialAds?: Ad[],
  initialTotal?: number,
  initialGeo?: { pais: string | null; estado: string | null; cidade: string | null },
  // BUG CORRIGIDO (achado ao vivo pelo usuário): cidade sem anúncio nenhum
  // caía direto no estado vazio, sem explicar nada — ver
  // getAdsListagemComFallbackGeografico em lib/services/ads.service.ts.
  // Presente só quando a busca precisou ampliar de verdade (cidade→estado→
  // país→tudo); nesse caso initialAds já vem preenchido com os resultados
  // do nível mais amplo que funcionou, então só falta avisar o motivo.
  geoFallback?: GeoFallbackInfo | null,
  categories?: Category[],
  sellerId?: string,
  hideHero?: boolean,
  heroTitle?: string,
  hideHeroBreadcrumb?: boolean,
  // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário): em
  // /categoria/[slug], a categoria vem do SLUG da rota, não de `?categoria=`
  // — `categoria` (lido só de useSearchParams, ver lib/useAdsFilters.ts)
  // nascia sempre '' nessa rota, igual a "nenhuma categoria escolhida".
  // Efeito em cascata: a sidebar mostrava "Todas as Categorias" marcado
  // (enganoso, já que a página inteira é só Bovinos) E as seções
  // Subcategoria/Finalidade sumiam por completo (gated por `categoria`
  // truthy) — o usuário não conseguia filtrar por raça/finalidade numa
  // página de categoria, só em /listagem?categoria=X. Mesmo padrão já usado
  // por heroTitle/hideHeroBreadcrumb acima pra esse mesmo problema raiz,
  // agora estendido pra sidebar: resolveCategoryContext (categoria/[slug]/
  // page.tsx) calcula a categoria efetiva (slug OU override de
  // ?categoria=) e repassa aqui só pra exibição/opções — nunca sobrescreve
  // a categoria REAL controlada por useAdsFilters, que seguem sendo a
  // fonte de verdade pra montar URLs (ver displayCategoria abaixo).
  effectiveCategoria?: string,
  nextCursor?: string,
  children?: React.ReactNode
}) {
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const filtersHook = useAdsFilters(initialGeo);
  
  const {
    busca, setBusca,
    categoria, setCategoria,
    subcategoria, setSubcategoria, toggleSubcategoria,
    finalidade, setFinalidade,
    pais, setPais,
    estado, setEstado,
    cidade, setCidade,
    lat, lng, raio, setRaio,
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

  // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário): ver
  // comentário de `effectiveCategoria` na assinatura acima. `categoria`
  // (query param real) tem prioridade — só cai pro valor efetivo do slug
  // quando não há override explícito na URL.
  const displayCategoria = categoria || effectiveCategoria || '';

  const { countries, states, cities } = useGeoCascading(pais, estado, displayCategoria);

  // Subcategorias dependem só da categoria escolhida no filtro — busca direto
  // na tabela normalizada (diferente de useGeoCascading, que deriva valores
  // distintos de `ads`; aqui a fonte é `subcategories`).
  const [subcategories, setSubcategories] = useState<{ id: string; name_pt: string; name_es?: string | null }[]>([]);
  // Contagem de anúncios ativos por subcategoria — evita o usuário escolher
  // uma raça/tipo sem nenhum anúncio. Um único fetch dos ids (sem agregação
  // no banco) e conta no cliente, mesmo padrão já usado em useGeoCascading.
  const [subcategoryCounts, setSubcategoryCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!displayCategoria) {
      setSubcategories([]);
      setSubcategoryCounts({});
      return;
    }
    let isActive = true;
    getSupabase()
      .from('subcategories')
      .select('id, name_pt, name_es')
      .eq('category_id', displayCategoria)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        if (isActive && data) setSubcategories(data);
      });
    getSupabase()
      .from('ads')
      .select('subcategory_id')
      .eq('category_id', displayCategoria)
      .eq('status', 'active')
      .not('subcategory_id', 'is', null)
      .then(({ data }: { data: any[] | null }) => {
        if (!isActive || !data) return;
        const counts: Record<string, number> = {};
        for (const row of data) counts[row.subcategory_id] = (counts[row.subcategory_id] || 0) + 1;
        setSubcategoryCounts(counts);
      });
    return () => { isActive = false; };
  }, [displayCategoria]);

  const PAGE_SIZE = 24;
  // BUG CORRIGIDO (varredura cruzada de cenários): comparar só o tamanho da
  // página atual faz "Próxima" ficar habilitado incorretamente sempre que o
  // total de resultados for um múltiplo exato de PAGE_SIZE (ex.: exatamente
  // 24, 48...) — a última página real também teria initialAds.length===24.
  // Usa page × PAGE_SIZE contra o total real (initialTotal, já disponível).
  const hasMore = page * PAGE_SIZE < initialTotal;
  // GAP CORRIGIDO (auditoria de usabilidade): ListagemPagination só mostrava
  // "Página N", sem total nem forma de o usuário saber quantas páginas
  // faltam — reaproveita o mesmo PAGE_SIZE já usado acima pra `hasMore`.
  const totalPages = Math.max(1, Math.ceil(initialTotal / PAGE_SIZE));
  // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário):
  // navegar pra uma página além da última real (ex.: ?page=3 quando só
  // existem 2) fazia getAdsListagem cair no catch de PGRST103 e devolver
  // `ads: []` — só que sem paginação nenhuma na tela (abaixo, a paginação
  // só aparecia quando initialAds.length > 0), o usuário ficava preso na
  // tela vazia sem link de volta pras páginas que realmente têm resultado.
  // `page` aqui já reflete a URL real (via useAdsFilters/useSearchParams),
  // então dá pra distinguir esse caso de "nenhum anúncio pra estes filtros"
  // de verdade (esse sim sem paginação, não faz sentido mostrá-la).
  const isPageOverflow = initialAds.length === 0 && initialTotal > 0 && page > totalPages;

  const contextValue = {
    lang, categories, subcategories, subcategoryCounts,
    countries, states: states.map(s => s.id), cities,
    hasFilters, clearFilters, applyFilters, handleSearch,
    busca, categoria: displayCategoria, setCategoria, subcategoria, setSubcategoria, toggleSubcategoria, finalidade, setFinalidade,
    pais, setPais, estado, setEstado, cidade, setCidade,
    lat, lng, raio, setRaio,
    precoMin, setPrecoMin, precoMax, setPrecoMax, setPrice,
    destaque, setDestaque, negociavel, setNegociavel,
    // BUG CORRIGIDO (usuário achou ao vivo, print da listagem): o chip
    // "Filtros Ativos" já avisava quando a busca geográfica amplia sozinha
    // (cidade sem anúncio → estado/país/tudo), mas a própria barra lateral
    // (país/estado/cidade selecionados, raio em km destacado) continuava
    // parecendo uma restrição real em vigor — nenhum dos dois refletia que
    // a busca de verdade já tinha sido ampliada. AdsSidebar usa isso pra
    // não destacar nenhum raio como "ativo" quando o nível alcançado já
    // passou de radius_wide (estado/país/tudo).
    geoFallback,
  };

  const currentCatName = displayCategoria ? (categories.find(c => c.id === displayCategoria)?.[lang === 'es' ? 'name_es' : 'name_pt'] || displayCategoria) : '';

  // GAP CORRIGIDO (sugestão de usabilidade): "Limpar Filtros e Tentar
  // Novamente" apagava TUDO de uma vez, mesmo quando só o filtro mais
  // específico (ex.: finalidade) é que zerou os resultados. Sugere remover
  // só o filtro mais restritivo primeiro — ordem do mais específico pro
  // mais amplo — preservando o resto da busca já feita.
  function getNarrowestFilterRemoval(): { label: string; action: () => void } | null {
    if (finalidade) {
      // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário):
      // quando `finalidade` pertence a uma categoria DIFERENTE da
      // atualmente selecionada (ex.: URL editada manualmente, ou troca de
      // categoria sem limpar finalidade), getPurposeOptions(categoria) não
      // encontra o valor — o fallback mostrava o slug cru do banco (ex.:
      // "reproducao") em vez de um rótulo traduzido, sem sentido pro
      // usuário. Rótulo genérico em vez do valor bruto.
      const label = getPurposeOptions(displayCategoria).find(p => p.value === finalidade)?.[lang === 'es' ? 'label_es' : 'label_pt'] || T.unknownFilterLabel;
      return { label, action: () => setFinalidade('') };
    }
    if (subcategoria) {
      // Mesmo bug/fix do finalidade acima: `subcategories` só carrega as
      // opções da categoria ATUAL — um id de subcategoria de outra
      // categoria (mesmo cenário: URL manual, troca de categoria) não
      // resolve nome nenhum, e o fallback mostrava o(s) UUID(s) cru(s).
      const names = subcategoria.split(',')
        .map(id => subcategories.find(s => s.id === id))
        .filter((s): s is { id: string; name_pt: string; name_es?: string | null } => !!s)
        .map(s => (lang === 'es' && s.name_es) ? s.name_es : s.name_pt);
      return { label: names.join(' + ') || T.unknownFilterLabel, action: () => setSubcategoria('') };
    }
    if (precoMin || precoMax) {
      return { label: T.priceRangeLabel, action: () => setPrice('', '') };
    }
    // GAP CORRIGIDO (auditoria de usabilidade): a cadeia de prioridade nunca
    // considerava cidade/estado/país, mesmo esta localização sendo aplicada
    // automaticamente via geolocalização (ActiveFiltersList/useAutoGeo) sem
    // nenhuma ação do usuário — a causa mais provável de "0 resultados" pra
    // quem não percebeu que já estava sendo filtrado pela própria região.
    // Cidade > estado > país (do mais específico pro mais amplo), antes de
    // categoria.
    if (cidade) {
      return { label: cidade, action: () => setCidade('') };
    }
    if (estado) {
      return { label: estado, action: () => setEstado('') };
    }
    if (pais) {
      return {
        label: pais, action: () => {
          // Mesmo padrão de AdsSidebar.tsx (select de país) e
          // ActiveFiltersList.tsx/useAutoGeo.ts (remoção do último nível de
          // geo): sem apagar o cookie, o próximo request no servidor
          // (getGeoParams, sem pais/estado/cidade manuais na URL) reinjeta a
          // mesma geolocalização via initialGeo, fazendo o filtro "voltar"
          // sozinho um instante depois de parecer removido.
          try {
            document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            clearGeoCache();
          } catch { /* ignore */ }
          setPais('');
        }
      };
    }
    if (displayCategoria) {
      return { label: currentCatName, action: () => setCategoria('') };
    }
    if (busca) {
      return { label: `"${busca}"`, action: () => setBusca('') };
    }
    return null;
  }
  const narrowestFilter = getNarrowestFilterRemoval();

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
            <ActiveFiltersList categories={categories} initialGeo={initialGeo} disableAutoGeo={!!sellerId} geoFallback={geoFallback} effectiveCategoria={displayCategoria} />

            {geoFallback && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)', background: 'var(--clr-primary-pale)', color: 'var(--clr-primary-mid)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>{buildGeoFallbackMessage(geoFallback, lang as 'pt' | 'es')}</span>
              </div>
            )}

            <div style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: isPending ? 'none' : 'auto' }}>
              {isPageOverflow ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-20) var(--sp-8)', background: 'var(--clr-surface)', borderRadius: 'var(--r-2xl)', border: '1px dashed var(--clr-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '80px', height: '80px', background: 'var(--clr-primary-pale)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: 'var(--sp-6)', color: 'var(--clr-primary)', boxShadow: '0 0 0 10px rgba(34,197,94,0.05)' }}>🔍</div>
                  <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--clr-text)', marginBottom: 'var(--sp-2)', letterSpacing: '-0.02em' }}>{T.emptyOverflowTitle}</h3>
                  <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-base)', maxWidth: '360px', marginBottom: 'var(--sp-8)', lineHeight: 1.6 }}>{T.emptyOverflowDesc(initialTotal, totalPages)}</p>
                  {/* GAP CORRIGIDO (revalidação independente pós-deploy):
                      reaproveitar ListagemPagination aqui fazia "Anterior"
                      sempre decrementar 1 (page-1) — em overflow extremo
                      (ex.: ?page=99999 numa busca com só 51 páginas reais),
                      page-1 (99998) continua tão inválida quanto a original,
                      exigindo dezenas de milhares de cliques pra voltar a
                      algo real. Link direto pra ÚLTIMA página válida
                      (totalPages) resolve em 1 clique, em vez de decrementar
                      de 1 em 1. */}
                  <button onClick={() => setPage(totalPages)} className="btn btn--primary" style={{ padding: '12px 32px' }}>
                    {T.emptyOverflowBackBtn(totalPages)}
                  </button>
                </div>
              ) : initialAds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-20) var(--sp-8)', background: 'var(--clr-surface)', borderRadius: 'var(--r-2xl)', border: '1px dashed var(--clr-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '80px', height: '80px', background: 'var(--clr-primary-pale)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: 'var(--sp-6)', color: 'var(--clr-primary)', boxShadow: '0 0 0 10px rgba(34,197,94,0.05)' }}>🔍</div>
                  <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--clr-text)', marginBottom: 'var(--sp-2)', letterSpacing: '-0.02em' }}>{T.emptyTitle}</h3>
                  <p style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-base)', maxWidth: '360px', marginBottom: 'var(--sp-8)', lineHeight: 1.6 }}>{T.emptyDesc}</p>
                  {narrowestFilter ? (
                    <>
                      <button onClick={narrowestFilter.action} className="btn btn--primary" style={{ padding: '12px 32px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        <span>{T.emptyBtnRemove(narrowestFilter.label)}</span>
                      </button>
                      <button onClick={clearFilters} style={{ marginTop: 'var(--sp-3)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)', fontSize: 'var(--fs-sm)', textDecoration: 'underline' }}>
                        {T.emptyBtnClearAll}
                      </button>
                    </>
                  ) : (
                    <button onClick={clearFilters} className="btn btn--primary" style={{ padding: '12px 32px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                      <span>{T.emptyBtn}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <AdsGrid ads={initialAds} categories={categories} />
                  <ListagemPagination hasMore={hasMore} totalPages={totalPages} />
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
