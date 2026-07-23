import { useCallback, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useDebounce } from 'use-debounce';

export interface AdsFilters {
  busca: string;
  categoria: string;
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
    pais,
    estado,
    cidade,
    precoMin,
    precoMax,
    ordem,
    destaque,
    negociavel,
    page
  }), [debouncedBusca, categoria, pais, estado, cidade, precoMin, precoMax, ordem, destaque, negociavel, page]);

  const hasFilters = !!(categoria || pais || estado || cidade || precoMin || precoMax || destaque || negociavel || debouncedBusca);

  const getPageUrl = useCallback((p: number, overrides: Partial<AdsFilters> = {}) => {
    const f = { ...filters, busca: buscaRaw, ...overrides };
    const params = new URLSearchParams();
    if (f.busca) params.set('busca', f.busca);
    if (f.categoria) params.set('categoria', f.categoria);
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
  }, [pathname, filters, buscaRaw]);

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
  const setCategoria = useCallback((v: string) => applyFilters({ categoria: v }), [applyFilters]);
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
