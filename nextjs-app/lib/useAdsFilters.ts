import { useCallback, useEffect, useMemo, useRef, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useDebounce } from 'use-debounce';

export interface AdsFilters {
  busca: string;
  categoria: string;
  subcategoria: string;
  finalidade: string;
  pais: string;
  estado: string;
  cidade: string;
  precoMin: string;
  precoMax: string;
  ordem: string;
  destaque: boolean;
  negociavel: boolean;
  page: number;
}

export function useAdsFilters(initialGeo?: { pais: string | null; estado: string | null; cidade: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const buscaRaw = searchParams.get('busca') || '';
  const [debouncedBusca] = useDebounce(buscaRaw, 350);

  const categoria = searchParams.get('categoria') || '';
  const subcategoria = searchParams.get('subcategoria') || '';
  const finalidade = searchParams.get('finalidade') || '';
  const pais = searchParams.get('pais') || initialGeo?.pais || '';
  const estado = searchParams.get('estado') || initialGeo?.estado || '';
  const cidade = searchParams.get('cidade') || initialGeo?.cidade || '';
  const precoMin = searchParams.get('preco_min') || '';
  const precoMax = searchParams.get('preco_max') || '';
  const ordem = searchParams.get('ordem') || 'recent';
  const destaque = searchParams.get('destaque') === 'true';
  const negociavel = searchParams.get('negociavel') === 'true';
  const page = Number(searchParams.get('page')) || 1;

  // Derivando filtros
  const filters = useMemo<AdsFilters>(() => ({
    busca: debouncedBusca,
    categoria,
    subcategoria,
    finalidade,
    pais,
    estado,
    cidade,
    precoMin,
    precoMax,
    ordem,
    destaque,
    negociavel,
    page
  }), [debouncedBusca, categoria, subcategoria, finalidade, pais, estado, cidade, precoMin, precoMax, ordem, destaque, negociavel, page]);

  const hasFilters = !!(categoria || subcategoria || finalidade || pais || estado || cidade || precoMin || precoMax || destaque || negociavel || debouncedBusca);

  // BUG CORRIGIDO (teste completo do site, 2026-08-24): getPageUrl usava
  // `filters` (derivado do useSearchParams() do React — uma snapshot do
  // ÚLTIMO RENDER) como base. Mudar dois filtros em sequência rápida — antes
  // do router.push do primeiro COMMITAR um re-render com searchParams
  // atualizado — fazia a segunda chamada mesclar overrides sobre uma
  // snapshot desatualizada, descartando a primeira mudança em silêncio.
  // Tentativa de ler window.location.search fresco NÃO resolveu: o
  // router.push dentro de startTransition não atualiza a URL do navegador
  // de forma síncrona, então mesmo lendo "ao vivo" a segunda chamada ainda
  // via a URL antiga. A solução real é uma ref mutável, atualizada
  // SINCRONAMENTE a cada chamada — não depende de re-render do React nem de
  // quando o navegador de fato terminar de navegar.
  const latestFiltersRef = useRef<AdsFilters>(filters);
  useEffect(() => { latestFiltersRef.current = filters; }, [filters]);

  const getPageUrl = useCallback((p: number, overrides: Partial<AdsFilters> = {}) => {
    const f = { ...latestFiltersRef.current, busca: buscaRaw, ...overrides, page: p };
    latestFiltersRef.current = f;
    const params = new URLSearchParams();
    if (f.busca) params.set('busca', f.busca);
    if (f.categoria) params.set('categoria', f.categoria);
    if (f.subcategoria) params.set('subcategoria', f.subcategoria);
    if (f.finalidade) params.set('finalidade', f.finalidade);
    if (f.pais) params.set('pais', f.pais);
    if (f.estado) params.set('estado', f.estado);
    if (f.cidade) params.set('cidade', f.cidade);
    if (f.precoMin) params.set('preco_min', f.precoMin);
    if (f.precoMax) params.set('preco_max', f.precoMax);
    if (f.destaque) params.set('destaque', 'true');
    if (f.negociavel) params.set('negociavel', 'true');
    if (f.ordem && f.ordem !== 'recent') params.set('ordem', f.ordem);
    if (p > 1) params.set('page', p.toString());
    
    return `${pathname}${params.toString() ? '?' + params.toString() : ''}`;
  }, [pathname, buscaRaw]);

  const applyFilters = useCallback((overrides: Partial<AdsFilters> = {}) => {
    startTransition(() => {
      router.push(getPageUrl(1, overrides), { scroll: false });
    });
  }, [router, getPageUrl]);

  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }, [pathname, router]);

  // Setters helpers
  const setBusca = useCallback((v: string) => applyFilters({ busca: v }), [applyFilters]);
  const setCategoria = useCallback((v: string) => applyFilters({ categoria: v, subcategoria: '', finalidade: '' }), [applyFilters]);
  const setSubcategoria = useCallback((v: string) => applyFilters({ subcategoria: v }), [applyFilters]);
  // Subcategoria (raça/tipo) aceita múltipla seleção no filtro — lista
  // separada por vírgula na URL (ex.: ?subcategoria=sub-a,sub-b). Diferente
  // do formulário de anúncio, onde continua sendo uma escolha só.
  const toggleSubcategoria = useCallback((id: string) => {
    const current = latestFiltersRef.current.subcategoria ? latestFiltersRef.current.subcategoria.split(',') : [];
    const next = current.includes(id) ? current.filter(v => v !== id) : [...current, id];
    applyFilters({ subcategoria: next.join(',') });
  }, [applyFilters]);
  const setFinalidade = useCallback((v: string) => applyFilters({ finalidade: v }), [applyFilters]);
  const setPais = useCallback((v: string) => applyFilters({ pais: v }), [applyFilters]);
  const setEstado = useCallback((v: string) => applyFilters({ estado: v }), [applyFilters]);
  const setCidade = useCallback((v: string) => applyFilters({ cidade: v }), [applyFilters]);
  const setPrecoMin = useCallback((v: string) => applyFilters({ precoMin: v }), [applyFilters]);
  const setPrecoMax = useCallback((v: string) => applyFilters({ precoMax: v }), [applyFilters]);
  const setPrice = useCallback((min: string, max: string) => applyFilters({ precoMin: min, precoMax: max }), [applyFilters]);
  const setOrdem = useCallback((v: string) => applyFilters({ ordem: v }), [applyFilters]);
  const setDestaque = useCallback((v: boolean) => applyFilters({ destaque: v }), [applyFilters]);
  const setNegociavel = useCallback((v: boolean) => applyFilters({ negociavel: v }), [applyFilters]);
  const setPage = useCallback((p: number) => router.push(getPageUrl(p), { scroll: false }), [router, getPageUrl]);

  return {
    busca: buscaRaw, setBusca, debouncedBusca,
    categoria, setCategoria,
    subcategoria, setSubcategoria, toggleSubcategoria,
    finalidade, setFinalidade,
    pais, setPais,
    estado, setEstado,
    cidade, setCidade,
    precoMin, setPrecoMin,
    precoMax, setPrecoMax, setPrice,
    ordem, setOrdem,
    destaque, setDestaque,
    negociavel, setNegociavel,
    page, setPage,
    filters,
    hasFilters,
    getPageUrl,
    applyFilters,
    clearFilters,
    handleSearch: setBusca,
    isPending
  };
}
