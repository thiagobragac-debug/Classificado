'use client';

import { useAdsFilters } from '@/lib/useAdsFilters';
import { useAutoGeo } from '@/lib/useAutoGeo';
import { Category } from '@/components/ads/AdCard';
import { useLang } from '@/lib/lang-context';
import { useSearchParams } from 'next/navigation';

const TRANSLATIONS = {
  pt: {
    activeFilters: 'FILTROS ATIVOS:',
    removeFilter: (label: string) => `Remover filtro de ${label}`,
    clearAll: 'Limpar Todos',
    min: 'Min',
    max: 'Max',
  },
  es: {
    activeFilters: 'FILTROS ACTIVOS:',
    removeFilter: (label: string) => `Quitar filtro de ${label}`,
    clearAll: 'Limpiar Todos',
    min: 'Mín',
    max: 'Máx',
  }
};

export default function ActiveFiltersList({ categories, initialGeo, disableAutoGeo }: { categories: Category[], initialGeo?: { pais: string | null; estado: string | null; cidade: string | null }, disableAutoGeo?: boolean }) {
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const searchParams = useSearchParams();

  const {
    busca, categoria, pais, estado, cidade,
    precoMin, precoMax, destaque, negociavel,
    applyFilters, clearFilters, setCategoria, setPais, setEstado, setCidade, setPrice, setDestaque, setNegociavel, setBusca
  } = useAdsFilters(initialGeo);

  const { geoLabel, advanceGeoLevel } = useAutoGeo(
    pais, setPais, estado, setEstado, cidade, setCidade, applyFilters, initialGeo, searchParams, disableAutoGeo, lang
  );

  const getActiveFilters = () => {
    const list = [];
    if (busca) list.push({ key: 'busca', label: `"${busca}"`, action: () => { setBusca(''); }});
    if (categoria) {
      const catName = categories.find(c => c.id === categoria)?.[lang === 'es' ? 'name_es' : 'name_pt'] || categoria;
      list.push({ key: 'categoria', label: catName, action: () => { setCategoria(''); }});
    }
    
    if (geoLabel && (pais || estado || cidade)) {
      list.push({ key: 'geoLabel', label: geoLabel, action: advanceGeoLevel, isGeo: true });
    } else if (pais || estado || cidade) {
      const manualLabel = cidade || estado || pais;
      list.push({ key: 'manualGeo', label: manualLabel as string, action: () => { 
        try {
          document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          localStorage.removeItem('user_loc_v8');
        } catch { /* ignore */ }
        applyFilters({ pais: '', estado: '', cidade: '' }); 
      }, isGeo: true });
    }

    if (precoMin && precoMax) list.push({ key: 'preco', label: `R$${precoMin} - R$${precoMax}`, action: () => { setPrice('', ''); }});
    else if (precoMin) list.push({ key: 'precoMin', label: `${T.min} R$${precoMin}`, action: () => { setPrice('', precoMax); }});
    else if (precoMax) list.push({ key: 'precoMax', label: `${T.max} R$${precoMax}`, action: () => { setPrice(precoMin, ''); }});

    if (destaque) list.push({ key: 'destaque', label: t('section_featured'), action: () => { setDestaque(false); }});
    if (negociavel) list.push({ key: 'negociavel', label: t('negociable'), action: () => { setNegociavel(false); }});
    return list;
  };

  const activeBadges = getActiveFilters();

  if (activeBadges.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)', position: 'sticky', top: 'calc(var(--header-h) + var(--sp-4))', zIndex: 10, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', padding: '8px 0', borderBottom: '1px solid var(--clr-border-light)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', fontWeight: 600 }}>{T.activeFilters}</span>
        {activeBadges.map(b => (
          <span 
            key={b.key} 
            style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '6px', 
              background: b.isGeo ? 'var(--clr-accent-pale)' : 'var(--clr-primary-pale)', 
              color: b.isGeo ? 'var(--clr-accent-dark)' : 'var(--clr-primary-mid)', 
              padding: '4px 12px', borderRadius: 'var(--r-full)', 
              fontSize: 'var(--fs-xs)', fontWeight: 600, 
              border: `1px solid ${b.isGeo ? 'var(--clr-accent-soft)' : 'var(--clr-primary-soft)'}` 
            }}
          >
            {b.isGeo && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            )}
            {b.label}
            <button
              aria-label={T.removeFilter(b.label)}
              onClick={b.action} 
              style={{ 
                background: b.isGeo ? 'rgba(234, 179, 8, 0.15)' : 'rgba(22,163,74,0.15)', 
                color: b.isGeo ? 'var(--clr-accent-dark)' : 'var(--clr-primary)', 
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%' 
              }}
            >✕</button>
          </span>
        ))}
        <button 
          onClick={clearFilters} 
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer', 
            fontSize: 'var(--fs-xs)', color: 'var(--clr-text-light)', 
            textDecoration: 'underline', fontWeight: 500, marginLeft: 'var(--sp-2)' 
          }}
        >
          {T.clearAll}
        </button>
      </div>
    </div>
  );
}
