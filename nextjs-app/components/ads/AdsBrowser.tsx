'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { AdBanner } from '@/components/AdBanner';
import { useLang } from '@/lib/lang-context';
import { useGeoLocation, normalizeStr } from '@/lib/useGeoLocation';
import { useFavorites } from '@/lib/useFavorites';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Category { id: string; name_pt: string; name_es: string; icon: string; color: string; active: boolean; sort_order: number; }
interface Ad { id: string; title_pt: string; title_es: string; price: number; currency: string; price_unit_pt: string; negotiable: boolean; country: string; state: string; city: string; location_text: string; images: string[]; tags_pt: string[]; status: string; featured: boolean; created_at: string; category_id: string; }

const IMG_BASE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/';
const PAGE_SIZE = 24;

export const COUNTRY_FLAGS: Record<string, string> = {
  'Brasil': '🇧🇷', 'Uruguai': '🇺🇾', 'Argentina': '🇦🇷',
  'Paraguai': '🇵🇾', 'Chile': '🇨🇱', 'Colômbia': '🇨🇴',
  'Peru': '🇵🇪', 'Bolívia': '🇧🇴', 'Venezuela': '🇻🇪',
  'Equador': '🇪🇨', 'Estados Unidos': '🇺🇸', 'Portugal': '🇵🇹'
};

const BR_STATES: Record<string, string> = {
  'Acre': 'AC', 'AC': 'Acre',
  'Alagoas': 'AL', 'AL': 'Alagoas',
  'Amapá': 'AP', 'AP': 'Amapá',
  'Amazonas': 'AM', 'AM': 'Amazonas',
  'Bahia': 'BA', 'BA': 'Bahia',
  'Ceará': 'CE', 'CE': 'Ceará',
  'Distrito Federal': 'DF', 'DF': 'Distrito Federal',
  'Espírito Santo': 'ES', 'ES': 'Espírito Santo',
  'Goiás': 'GO', 'GO': 'Goiás',
  'Maranhão': 'MA', 'MA': 'Maranhão',
  'Mato Grosso': 'MT', 'MT': 'Mato Grosso',
  'Mato Grosso do Sul': 'MS', 'MS': 'Mato Grosso do Sul',
  'Minas Gerais': 'MG', 'MG': 'Minas Gerais',
  'Pará': 'PA', 'PA': 'Pará',
  'Paraíba': 'PB', 'PB': 'Paraíba',
  'Paraná': 'PR', 'PR': 'Paraná',
  'Pernambuco': 'PE', 'PE': 'Pernambuco',
  'Piauí': 'PI', 'PI': 'Piauí',
  'Rio de Janeiro': 'RJ', 'RJ': 'Rio de Janeiro',
  'Rio Grande do Norte': 'RN', 'RN': 'Rio Grande do Norte',
  'Rio Grande do Sul': 'RS', 'RS': 'Rio Grande do Sul',
  'Rondônia': 'RO', 'RO': 'Rondônia',
  'Roraima': 'RR', 'RR': 'Roraima',
  'Santa Catarina': 'SC', 'SC': 'Santa Catarina',
  'São Paulo': 'SP', 'SP': 'São Paulo',
  'Sergipe': 'SE', 'SE': 'Sergipe',
  'Tocantins': 'TO', 'TO': 'Tocantins',
};

function fmtPrice(price: number, currency = 'BRL', lang = 'pt') {
  return new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'pt-BR', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(price);
}

function fmtCount(n: number) {
  if (n === 1) return '1 anúncio encontrado';
  return `${n} anúncios encontrados`;
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  if (d < 30) return `${d} dias atrás`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ─── Collapsible filter group ─────────────────────────────────────────────────
function FilterGroup({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="filter-group">
      <button className="filter-group-title" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && <div className="filter-options">{children}</div>}
    </div>
  );
}

interface AdsBrowserProps {
  sellerId?: string;
  heroTitle?: string;
  hideHeroBreadcrumb?: boolean;
  hideHero?: boolean;
  children?: React.ReactNode; // Injected between Hero and List Layout (e.g. Seller Profile Card)
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdsBrowser({ sellerId, heroTitle, hideHeroBreadcrumb, hideHero, children }: AdsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const { favs, toggleFav } = useFavorites();
  const sb = getSupabase();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const geoAppliedRef = useRef(false);
  const isFirstLoadRef = useRef(true);

  // Geolocalização automática
  const { geo, loading: geoLoading } = useGeoLocation();
  const hasSpecificManualLoc = !!(searchParams.get('pais') && (searchParams.get('estado') || searchParams.get('cidade')));

  // Filter state
  const [busca,      setBusca]      = useState(searchParams.get('busca')      || '');
  const [categoria,  setCategoria]  = useState(searchParams.get('categoria')  || '');
  const [pais,       setPais]       = useState(searchParams.get('pais')       || '');
  const [estado,     setEstado]     = useState(searchParams.get('estado')     || '');
  const [cidade,     setCidade]     = useState(searchParams.get('cidade')     || '');

  // Nome exibido no geo-badge (city > state > country)
  const [geoLabel,   setGeoLabel]   = useState<string | null>(null);
  const [geoLevel,   setGeoLevel]   = useState<'city'|'state'|'country'|null>(null);
  const [precoMin,   setPrecoMin]   = useState(searchParams.get('preco_min')  || '');
  const [precoMax,   setPrecoMax]   = useState(searchParams.get('preco_max')  || '');
  const [ordem,      setOrdem]      = useState(searchParams.get('ordem')      || 'recent');
  const [destaque,   setDestaque]   = useState(searchParams.get('destaque')   === 'true');
  const [negociavel, setNegociavel] = useState(searchParams.get('negociavel') === 'true');

  // Data
  const [ads,        setAds]        = useState<Ad[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [countries,  setCountries]  = useState<string[]>([]);
  const [states,     setStates]     = useState<string[]>([]);
  const [cities,     setCities]     = useState<string[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [viewMode,   setViewMode]   = useState<'grid'|'list'>('grid');
  const [filterOpen, setFilterOpen] = useState(false);
  const [geoReady,   setGeoReady]   = useState(false);

  const hasFilters = !!(categoria || pais || estado || cidade || precoMin || precoMax || destaque || negociavel || busca);

  // Carrega categorias e países no mount (sempre, independente do geo)
  useEffect(() => {
    sb.from('categories').select('*').eq('active', true).order('sort_order')
      .then(({ data }: { data: any }) => { if (data) setCategories(data); });
    
    // Se sellerId estiver presente, pegamos as localizações só daquele vendedor
    let q = sb.from('ads').select('country').eq('status', 'active').not('country', 'is', null);
    if (sellerId) q = q.eq('user_id', sellerId);
    
    q.then(({ data }: { data: any }) => {
      if (data) setCountries((([...new Set(data.map((r: any) => r.country).filter(Boolean))]) as string[]).sort());
    });
  }, [sb, sellerId]);

  // ── Auto-prefill de localização — cascade completo num único async ──────────
  useEffect(() => {
    if (!geo) return;
    if (geoAppliedRef.current) return;

    if (!geo) return;
    if (geoAppliedRef.current) return;
    if (hasSpecificManualLoc) return;

    const doGeoFill = async () => {
      let q = sb.from('ads').select('country').eq('status', 'active').not('country', 'is', null);
      if (sellerId) q = q.eq('user_id', sellerId);

      const { data: countryData } = await q;
      if (!countryData) return;

      const availCountries = [...new Set(
        countryData.map((r: any) => r.country).filter(Boolean)
      )] as string[];
      setCountries(availCountries.sort());

      const matchedCountry = availCountries.find(
        (c: string) => normalizeStr(c) === normalizeStr(geo.country)
      );
      if (!matchedCountry) return;

      geoAppliedRef.current = true;
      let newEstado = '';
      let newCidade = '';

      if (geo.state || geo.stateCode) {
        let qs = sb.from('ads').select('state').eq('status', 'active')
          .eq('country', matchedCountry).not('state', 'is', null);
        if (sellerId) qs = qs.eq('user_id', sellerId);
          
        const { data: stateData } = await qs;
        if (stateData) {
          const availStates = [...new Set(
            stateData.map((r: any) => r.state).filter(Boolean)
          )] as string[];
          setStates(availStates.sort());

          const matchedState = availStates.find((s: string) => {
            const ns = normalizeStr(s);
            const nState = normalizeStr(geo.state);
            const nStateCode = normalizeStr(geo.stateCode);
            const altState = geo.state ? normalizeStr(BR_STATES[geo.state] || BR_STATES[geo.stateCode || '']) : null;
            
            return (geo.stateCode && ns === nStateCode)
              || (geo.state && ns === nState)
              || (altState && ns === altState);
          });

          if (matchedState) {
            newEstado = matchedState;

            if (geo.city) {
              let qc = sb.from('ads').select('city').eq('status', 'active')
                .eq('country', matchedCountry).eq('state', matchedState)
                .not('city', 'is', null);
              if (sellerId) qc = qc.eq('user_id', sellerId);
                
              const { data: cityData } = await qc;
              if (cityData) {
                const availCities = [...new Set(
                  cityData.map((r: any) => r.city).filter(Boolean)
                )] as string[];
                setCities(availCities.sort());
                const matchedCity = availCities.find(
                  (c: string) => normalizeStr(c) === normalizeStr(geo.city)
                );
                if (matchedCity) newCidade = matchedCity;
              }
            }
          }
        }
      }

      setPais(matchedCountry);
      if (newEstado) setEstado(newEstado);
      if (newCidade) setCidade(newCidade);

      const stateLabel = geo.state || newEstado;
      if (newCidade) {
        setGeoLabel(`Perto de você — ${newCidade}`);
        setGeoLevel('city');
      } else if (newEstado) {
        setGeoLabel(`Seu estado — ${stateLabel}`);
        setGeoLevel('state');
      } else {
        setGeoLabel(`Seu país — ${matchedCountry}`);
        setGeoLevel('country');
      }
      setGeoReady(true);
    };

    if (!geoLoading) {
      if (!geo) {
        setGeoReady(true);
      } else {
        doGeoFill();
      }
    }
  }, [geo, geoLoading, sb, searchParams, sellerId]);

  const advanceGeoLevel = useCallback(() => {
    if (geoLevel === 'city')         { setCidade(''); setGeoLevel('state');   setGeoLabel(geo?.state ? `Seu estado — ${geo.state}` : null); }
    else if (geoLevel === 'state')   { setEstado(''); setCidade(''); setGeoLevel('country'); setGeoLabel(pais ? `Seu país — ${pais}` : null); }
    else if (geoLevel === 'country') { setPais('');   setEstado(''); setCidade(''); setGeoLevel(null); setGeoLabel(null); geoAppliedRef.current = false; }
  }, [geoLevel, geo, pais]);

  // Cascade manual: país → estados
  useEffect(() => {
    if (!pais) { setStates([]); setCities([]); setEstado(''); setCidade(''); return; }
    if (geoAppliedRef.current) return;
    
    let q = sb.from('ads').select('state').eq('status', 'active').eq('country', pais).not('state', 'is', null);
    if (sellerId) q = q.eq('user_id', sellerId);
    
    q.then(({ data }: { data: any }) => {
      if (data) setStates((([...new Set(data.map((r: any) => r.state).filter(Boolean))]) as string[]).sort());
    });
  }, [pais, sb, sellerId]);

  // Cascade manual: estado → cidades
  useEffect(() => {
    if (!estado) { setCities([]); setCidade(''); return; }
    
    let q = sb.from('ads').select('city').eq('status', 'active').eq('country', pais).eq('state', estado).not('city', 'is', null);
    if (sellerId) q = q.eq('user_id', sellerId);
    
    q.then(({ data }: { data: any }) => {
      if (data) setCities((([...new Set(data.map((r: any) => r.city).filter(Boolean))]) as string[]).sort());
    });
  }, [estado, pais, sb, sellerId]);

  // Fetch ads
  const fetchAds = useCallback(async (pg = 1) => {
    if (isFirstLoadRef.current) setLoading(true);
    const from = (pg - 1) * PAGE_SIZE;

    let q = sb.from('ads')
      .select('id, title_pt, title_es, price, currency, price_unit_pt, negotiable, country, state, city, location_text, images, tags_pt, status, featured, created_at, category_id', { count: 'exact' })
      .eq('status', 'active')
      .range(from, from + PAGE_SIZE - 1);

    if (sellerId)   q = q.eq('user_id', sellerId);
    if (categoria)  q = q.eq('category_id', categoria);
    if (pais)       q = q.ilike('country', pais);
    if (estado) {
      const altState = BR_STATES[estado];
      if (altState) {
        q = q.in('state', [estado, altState]);
      } else {
        q = q.ilike('state', estado);
      }
    }
    if (cidade)     q = q.ilike('city', cidade);
    if (precoMin)   q = q.gte('price', Number(precoMin));
    if (precoMax)   q = q.lte('price', Number(precoMax));
    if (destaque)   q = q.eq('featured', true);
    if (negociavel) q = q.eq('negotiable', true);
    if (busca)      q = q.or(`title_pt.ilike.%${busca}%,title_es.ilike.%${busca}%,description.ilike.%${busca}%`);

    if (ordem === 'price_asc')  q = q.order('price', { ascending: true });
    else if (ordem === 'price_desc') q = q.order('price', { ascending: false });
    else if (ordem === 'featured')   q = q.order('featured', { ascending: false }).order('created_at', { ascending: false });
    else                              q = q.order('created_at', { ascending: false });

    const { data, count, error } = await q;
    if (error) {
      console.error('[AdsBrowser] fetchAds error:', error.message, { pais, estado, cidade });
      setAds([]); setTotal(0);
    } else {
      setAds(data ?? []); setTotal(count ?? 0);
    }
    isFirstLoadRef.current = false;
    setLoading(false);
  }, [sb, sellerId, categoria, pais, estado, cidade, precoMin, precoMax, destaque, negociavel, busca, ordem]);

  useEffect(() => {
    if (geoReady || hasSpecificManualLoc) {
      fetchAds(page);
    }
  }, [fetchAds, page, geoReady, hasSpecificManualLoc]);

  // Update URL params
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (busca)      params.set('busca', busca);
    if (categoria)  params.set('categoria', categoria);
    if (pais)       params.set('pais', pais);
    if (estado)     params.set('estado', estado);
    if (cidade)     params.set('cidade', cidade);
    if (precoMin)   params.set('preco_min', precoMin);
    if (precoMax)   params.set('preco_max', precoMax);
    if (destaque)   params.set('destaque', 'true');
    if (negociavel) params.set('negociavel', 'true');
    if (ordem !== 'recent') params.set('ordem', ordem);
    
    // Use the current pathname so it works on /listagem OR /vendedor/[id]
    router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
    setPage(1);
  }, [busca, categoria, pais, estado, cidade, precoMin, precoMax, destaque, negociavel, ordem, router, pathname]);

  // Debounced search
  const handleSearch = (v: string) => {
    setBusca(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applyFilters, 350);
  };

  const clearFilters = () => {
    setBusca(''); setCategoria(''); setPais(''); setEstado(''); setCidade('');
    setPrecoMin(''); setPrecoMax(''); setDestaque(false); setNegociavel(false);
    setOrdem('recent'); setPage(1);
    router.push(pathname, { scroll: false });
  };

  const setPrice = (min: string, max: string) => { setPrecoMin(min); setPrecoMax(max); setTimeout(applyFilters, 50); };

  const currentCatName = categoria ? (categories.find(c => c.id === categoria)?.[lang === 'es' ? 'name_es' : 'name_pt'] || '') : '';

  // ─── Sidebar content ─────────────
  const Sidebar = () => (
    <>
      <div className="filter-header">
        <h2 className="filter-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filtros
        </h2>
        {hasFilters && <button className="filter-clear" onClick={clearFilters} id="clear-filters-btn">Limpar</button>}
      </div>

      <div className="filter-group" style={{ paddingBottom: '1.5rem' }}>
        <div className="location-group" style={{ display: 'flex', alignItems: 'center', paddingLeft: 'var(--sp-3)' }}>
          <span className="search-icon" style={{ color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input type="search" className="filter-select-clean" placeholder="Buscar anúncios..."
            value={busca} onChange={e => handleSearch(e.target.value)} />
        </div>
      </div>

      <FilterGroup title="Categoria">
        <label className="filter-option category-option">
          <input type="radio" name="category" value="" checked={categoria === ''} onChange={() => { setCategoria(''); setTimeout(applyFilters, 50); }} />
          <span className="cat-icon-wrap" style={{ color: 'var(--clr-text-muted)', fontSize: '14px' }}>🗂️</span>
          <span>Todas as Categorias</span>
        </label>
        {categories.map(cat => (
          <label key={cat.id} className="filter-option category-option">
            <input type="radio" name="category" value={cat.id} checked={categoria === cat.id} onChange={() => { setCategoria(cat.id); setTimeout(applyFilters, 50); }} />
            <span className="cat-icon-wrap" style={{ color: cat.color || 'var(--clr-text-muted)' }} dangerouslySetInnerHTML={{ __html: cat.icon || '🗂️' }} />
            <span>{lang === 'es' ? cat.name_es : cat.name_pt}</span>
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Localização">
        <div className="location-group">
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label="País"
              value={pais} onChange={e => { setPais(e.target.value); setEstado(''); setCidade(''); setTimeout(applyFilters, 50); }}>
              <option value="">Todos os Países</option>
              {countries.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c] || '🌎'} {c}</option>)}
            </select>
          </div>
          <div className="location-divider"></div>
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label="Estado" disabled={!pais}
              value={estado} onChange={e => { setEstado(e.target.value); setCidade(''); setTimeout(applyFilters, 50); }}>
              <option value="">Todos os Estados</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="location-divider"></div>
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label="Cidade" disabled={!estado}
              value={cidade} onChange={e => { setCidade(e.target.value); setTimeout(applyFilters, 50); }}>
              <option value="">Todas as Cidades</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </FilterGroup>

      <FilterGroup title="Faixa de Preço">
        <div className="price-input-group">
          <span className="price-currency">R$</span>
          <input type="number" className="price-input-clean" placeholder="Mínimo" aria-label="Preço mínimo"
            value={precoMin} onChange={e => setPrecoMin(e.target.value)} />
          <div className="price-divider"></div>
          <input type="number" className="price-input-clean" placeholder="Máximo" aria-label="Preço máximo"
            value={precoMax} onChange={e => setPrecoMax(e.target.value)} />
        </div>
        <div className="price-shortcuts" role="group" aria-label="Atalhos de preço">
          <button className="price-shortcut" onClick={() => setPrice('', '5000')}>Até 5k</button>
          <button className="price-shortcut" onClick={() => setPrice('5000', '20000')}>5k–20k</button>
          <button className="price-shortcut" onClick={() => setPrice('20000', '100000')}>20k–100k</button>
          <button className="price-shortcut" onClick={() => setPrice('100000', '')}>+100k</button>
        </div>
      </FilterGroup>

      <FilterGroup title="Tipo de Oferta">
        <label className="filter-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={destaque} onChange={e => { setDestaque(e.target.checked); setTimeout(applyFilters, 50); }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--clr-accent-pale)" stroke="var(--clr-accent)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Apenas Destaques
        </label>
        <label className="filter-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={negociavel} onChange={e => { setNegociavel(e.target.checked); setTimeout(applyFilters, 50); }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary-mid)" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          Negociável
        </label>
      </FilterGroup>

      <button className="btn btn--primary" onClick={applyFilters} style={{ width: '100%', marginTop: 'var(--sp-4)' }}>
        Aplicar Filtros
      </button>

      {/* Ad Banner dinâmico da Sidebar */}
      <AdBanner position="listagem_sidebar" />
    </>
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main style={{ marginTop: 'var(--header-h)', flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* ─── HERO ─── */}
      {!hideHero && (
        <div className="list-hero">
          <div className="container">
            <div className="list-hero-inner">
              <div>
                {!hideHeroBreadcrumb && (
                  <nav aria-label="Breadcrumb" className="breadcrumb">
                    <Link href="/">Início</Link>
                    <span aria-hidden="true">›</span>
                    <span>{currentCatName || 'Todos os Anúncios'}</span>
                  </nav>
                )}
                <h1 className="list-hero-title">
                  {heroTitle || currentCatName || 'Todos os Anúncios'}
                </h1>
                <p className="list-hero-count">
                  {loading ? '' : fmtCount(total)}
                </p>
              </div>
              <div className="list-sort-row" role="group" aria-label="Ordenação">
                <label htmlFor="sort-select" className="sort-label">Ordenar:</label>
                <select id="sort-select" className="sort-select" aria-label="Ordenar por"
                  value={ordem} onChange={e => { setOrdem(e.target.value); setTimeout(applyFilters, 50); }}>
                  <option value="recent">Mais Recentes</option>
                  <option value="price_asc">Menor Preço</option>
                  <option value="price_desc">Maior Preço</option>
                  <option value="featured">Destaques Primeiro</option>
                </select>
                <div className="view-toggle" role="group" aria-label="Modo de visualização">
                  <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')} aria-label="Visualização em grade" aria-pressed={viewMode === 'grid'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </button>
                  <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')} aria-label="Visualização em lista" aria-pressed={viewMode === 'list'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INJETAR CONTEÚDO EXTRA (Ex: Perfil do Vendedor) AQUI, ANTES DA GRADE */}
      {children}

      {/* ─── LAYOUT ─── */}
      <div className="container list-layout">

        {/* Sidebar desktop */}
        <aside className="filter-sidebar" aria-label="Filtros">
          <Sidebar />
        </aside>

        {/* Main */}
        <div className="list-main" role="main" aria-label="Lista de anúncios">

          {/* Active filter tags */}
          <div className="active-filters" aria-live="polite">

            {geoLabel && (pais || estado || cidade) && (
              <div id="geo-filter-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{geoLabel}</span>
                <button onClick={() => { advanceGeoLevel(); setTimeout(applyFilters, 50); }}
                  aria-label={geoLevel === 'city' ? `Ver todo ${estado || pais}` : geoLevel === 'state' ? `Ver todo ${pais}` : 'Ver todos os países'}>
                  ✕
                </button>
              </div>
            )}

            {!geoLabel && (pais || estado || cidade) && (
              <div id="geo-filter-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{cidade || estado || pais}</span>
                <button onClick={() => { setPais(''); setEstado(''); setCidade(''); setTimeout(applyFilters, 50); }}>✕</button>
              </div>
            )}

            {currentCatName && (
              <button className="active-filter-tag" onClick={() => { setCategoria(''); setTimeout(applyFilters, 50); }}>
                {currentCatName} <span aria-hidden="true">✕</span>
              </button>
            )}
            {busca && (
              <button className="active-filter-tag" onClick={() => { setBusca(''); setTimeout(applyFilters, 50); }}>
                &ldquo;{busca}&rdquo; <span aria-hidden="true">✕</span>
              </button>
            )}
            {destaque && (
              <button className="active-filter-tag" onClick={() => { setDestaque(false); setTimeout(applyFilters, 50); }}>
                Destaques <span aria-hidden="true">✕</span>
              </button>
            )}
            {negociavel && (
              <button className="active-filter-tag" onClick={() => { setNegociavel(false); setTimeout(applyFilters, 50); }}>
                Negociável <span aria-hidden="true">✕</span>
              </button>
            )}
            {(precoMin || precoMax) && (
              <button className="active-filter-tag" onClick={() => { setPrecoMin(''); setPrecoMax(''); setTimeout(applyFilters, 50); }}>
                {precoMin && precoMax ? `R$ ${precoMin}–${precoMax}` : precoMin ? `Acima R$ ${precoMin}` : `Até R$ ${precoMax}`}
                {' '}<span aria-hidden="true">✕</span>
              </button>
            )}
          </div>

          {/* Ad grid */}
          <div className={`ads-grid${viewMode === 'list' ? ' list-mode' : ''}`} role="list" aria-label="Anúncios encontrados">
            {loading ? (
              Array(8).fill(0).map((_, i) => (
                <div key={i} className="sk-card">
                  <div className="sk-img"></div>
                  <div className="sk-body">
                    <div className="sk-line" style={{ width: '40%' }}></div>
                    <div className="sk-line" style={{ width: '80%', marginTop: '8px' }}></div>
                    <div className="sk-line" style={{ width: '55%', marginTop: '8px', height: '18px' }}></div>
                  </div>
                </div>
              ))
            ) : ads.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 'var(--sp-16) var(--sp-6)', color: 'var(--clr-text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem' }}>🔍</div>
                <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>Nenhum anúncio encontrado</h3>
                <p style={{ maxWidth: '340px', lineHeight: 1.6, margin: 0 }}>Tente ajustar os filtros ou buscar por outro termo.</p>
                {hasFilters && <button onClick={clearFilters} className="btn btn--outline">Limpar todos os filtros</button>}
              </div>
            ) : (
              ads.map(ad => {
                const title = lang === 'es' ? (ad.title_es || ad.title_pt) : ad.title_pt;
                const imgPath = ad.images?.[0];
                const imgSrc = imgPath ? (imgPath.startsWith('http') ? imgPath : `${IMG_BASE}${imgPath}`) : '/assets/hero_farm.webp';
                const locParts = [ad.city, ad.state].filter(Boolean).join(', ');
                const flag = ad.country ? (COUNTRY_FLAGS[ad.country] || '🌎') : '';
                const loc = ad.location_text || [locParts, flag && `${flag} ${ad.country}`].filter(Boolean).join(' — ');
                const cat = categories.find(c => c.id === ad.category_id);
                const catName = cat ? (lang === 'es' ? cat.name_es : cat.name_pt) : '';

                return (
                  <article key={ad.id} className={`ad-card fade-in-up${ad.featured ? ' ad-card--featured' : ''}`}
                    role="listitem" onClick={() => window.location.href = `/anuncio/${ad.id}`} tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && (window.location.href = `/anuncio/${ad.id}`)}>
                    <div className="ad-card__image">
                      <img src={imgSrc} alt={title} loading="lazy" decoding="async" />
                      {catName && (
                        <div className="ad-card__category-badge" style={{ background: cat?.color || 'var(--clr-primary)', color: 'white' }}>
                          {catName}
                        </div>
                      )}
                      <button className={`ad-card__fav ${favs[ad.id] ? 'active' : ''}`} aria-label="Adicionar aos favoritos"
                        onClick={e => { e.stopPropagation(); toggleFav(ad.id); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </button>
                    </div>
                    <div className="ad-card__body">
                      <h3 className="ad-card__title">{title}</h3>
                      <div className="ad-card__price">
                        {ad.price != null ? fmtPrice(ad.price, ad.currency || 'BRL', lang) : 'Sob consulta'}
                        {ad.price_unit_pt && <small>/ {ad.price_unit_pt}</small>}
                      </div>
                      {ad.tags_pt?.length > 0 && (
                        <div className="ad-card__tags">
                          {ad.tags_pt.slice(0, 2).map((tag, i) => <span key={i} className="ad-tag">{tag}</span>)}
                          {ad.negotiable && <span className="ad-tag ad-tag--success">Negociável</span>}
                        </div>
                      )}
                      <div className="ad-card__meta">
                        <div className="ad-card__location">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>{loc}</span>
                        </div>
                        <span className="ad-card__time">{timeAgo(ad.created_at)}</span>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Navegação de páginas">
              {page > 1 && (
                <button className="page-btn" onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>‹</button>
              )}
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                const p = i + 1;
                return <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{p}</button>;
              })}
              {page < totalPages && (
                <button className="page-btn" onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>›</button>
              )}
            </nav>
          )}
        </div>
      </div>

      {/* ─── MOBILE FILTER SHEET ─── */}
      <button className="mobile-filter-btn" onClick={() => setFilterOpen(true)} aria-label="Abrir filtros">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filtros
      </button>

      <div className={`filter-sheet-overlay${filterOpen ? ' open' : ''}`} onClick={() => setFilterOpen(false)} aria-hidden="true"></div>
      <div className={`filter-sheet${filterOpen ? ' open' : ''}`} aria-label="Filtros móbile" role="dialog" aria-modal="true">
        <div className="filter-sheet-header">
          <h3>Filtros</h3>
          <button onClick={() => setFilterOpen(false)} aria-label="Fechar filtros">✕</button>
        </div>
        <div className="filter-sheet-body">
          <Sidebar />
        </div>
      </div>
    </main>
  );
}
