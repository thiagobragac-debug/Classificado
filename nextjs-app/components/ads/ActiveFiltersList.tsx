'use client';

import { useEffect, useState } from 'react';
import { useAdsFilters } from '@/lib/useAdsFilters';
import { useAutoGeo } from '@/lib/useAutoGeo';
import { clearGeoCache } from '@/lib/useGeoLocation';
import { Category } from '@/components/ads/AdCard';
import { useLang } from '@/lib/lang-context';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { getPurposeOptions } from '@/lib/purposeOptions';
import type { GeoFallbackInfo } from '@/lib/geo-cascade';

const TRANSLATIONS = {
  pt: {
    activeFilters: 'FILTROS ATIVOS:',
    removeFilter: (label: string) => `Remover filtro de ${label}`,
    clearAll: 'Limpar Todos',
    min: 'Min',
    max: 'Max',
    // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário): o
    // fallback mais amplo (nível 'all') pode incluir anúncios de FORA do
    // Brasil — o site é Mercosul (confirmado ao vivo: existe pelo menos 1
    // anúncio ativo do Uruguai que entra nesse fallback) — "todo o Brasil"
    // é impreciso nesse caso.
    fallbackAll: 'todo o Mercosul',
  },
  es: {
    activeFilters: 'FILTROS ACTIVOS:',
    removeFilter: (label: string) => `Quitar filtro de ${label}`,
    clearAll: 'Limpiar Todos',
    min: 'Mín',
    max: 'Máx',
    fallbackAll: 'todo el Mercosur',
  }
};

export default function ActiveFiltersList({ categories, initialGeo, disableAutoGeo, geoFallback }: { categories: Category[], initialGeo?: { pais: string | null; estado: string | null; cidade: string | null }, disableAutoGeo?: boolean, geoFallback?: GeoFallbackInfo | null }) {
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const searchParams = useSearchParams();

  const {
    busca, categoria, subcategoria, finalidade, pais, estado, cidade,
    precoMin, precoMax, destaque, negociavel,
    applyFilters, clearFilters, setCategoria, toggleSubcategoria, setFinalidade, setPais, setEstado, setCidade, setPrice, setDestaque, setNegociavel, setBusca
  } = useAdsFilters(initialGeo);

  const { geoLabel, advanceGeoLevel, suppressAutoGeo } = useAutoGeo(
    pais, setPais, estado, setEstado, cidade, setCidade, applyFilters, initialGeo, searchParams, disableAutoGeo, lang
  );

  // Nomes das subcategorias ativas — buscados à parte porque este componente
  // só recebe a lista de `categories` via prop. Subcategoria aceita múltipla
  // seleção (lista separada por vírgula), então busca todos os ids de uma
  // vez com .in() em vez de um fetch por id.
  const [subcategoriaNames, setSubcategoriaNames] = useState<Record<string, string>>({});
  const selectedSubcategorias = subcategoria ? subcategoria.split(',') : [];
  useEffect(() => {
    if (selectedSubcategorias.length === 0) {
      setSubcategoriaNames({});
      return;
    }
    let isActive = true;
    getSupabase()
      .from('subcategories')
      .select('id, name_pt, name_es')
      .in('id', selectedSubcategorias)
      .then(({ data }: { data: any[] | null }) => {
        if (!isActive || !data) return;
        const names: Record<string, string> = {};
        for (const row of data) names[row.id] = lang === 'es' && row.name_es ? row.name_es : row.name_pt;
        setSubcategoriaNames(names);
      });
    return () => { isActive = false; };
  }, [subcategoria, lang]);

  // BUG CORRIGIDO (usuário reportou ao vivo, print da listagem): quando a
  // busca geográfica amplia sozinha (cidade sem anúncio → cai pro estado/
  // país/tudo, ver getAdsListagemComFallbackGeografico), o chip continuava
  // mostrando só o valor ORIGINAL escolhido ("Patos de Minas") — sugerindo
  // que os resultados ainda são restritos a esse lugar, quando na prática a
  // busca já foi ampliada bem além dele (os cards mostrados nem são de lá).
  // O aviso abaixo dos chips (buildGeoFallbackMessage) já explica isso, mas
  // o chip em si — mais visível, no topo — continuava enganoso. Acrescenta
  // a transição de verdade ("Patos de Minas → Brasil") direto no chip.
  const withGeoFallback = (label: string) => {
    if (!geoFallback) return label;
    // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário):
    // busca por raio sem cidade usa o nome do ESTADO como rótulo de origem
    // (ver ads.service.ts) — quando o fallback aterrissa nesse mesmo
    // estado, o chip ficava "Pará → Pará" (mesma palavra dos dois lados).
    // Mesmo critério do buildGeoFallbackMessage: sem seta nesse caso.
    if (geoFallback.toLabel === label) return label;
    return `${label} → ${geoFallback.toLabel || T.fallbackAll}`;
  };

  const getActiveFilters = () => {
    const list = [];
    if (busca) list.push({ key: 'busca', label: `"${busca}"`, action: () => { setBusca(''); }});
    if (categoria) {
      const catName = categories.find(c => c.id === categoria)?.[lang === 'es' ? 'name_es' : 'name_pt'] || categoria;
      list.push({ key: 'categoria', label: catName, action: () => { setCategoria(''); }});
    }
    for (const id of selectedSubcategorias) {
      const name = subcategoriaNames[id];
      if (name) list.push({ key: `subcategoria-${id}`, label: name, action: () => toggleSubcategoria(id) });
    }
    if (finalidade) {
      const purposeName = getPurposeOptions(categoria).find(p => p.value === finalidade)?.[lang === 'es' ? 'label_es' : 'label_pt'] || finalidade;
      list.push({ key: 'finalidade', label: purposeName, action: () => { setFinalidade(''); }});
    }

    if (geoLabel && (pais || estado || cidade)) {
      list.push({ key: 'geoLabel', label: withGeoFallback(geoLabel), action: advanceGeoLevel, isGeo: true });
    } else if (pais || estado || cidade) {
      // BUG CORRIGIDO (achado ao vivo pelo usuário): este ramo (localização
      // MANUAL — o usuário escolheu país/estado/cidade pelos selects, ou o
      // rótulo "Perto de você" já foi invalidado pelo efeito de sincronismo
      // de useAutoGeo.ts) fechava o filtro inteiro de uma vez (país+estado+
      // cidade, todos limpos juntos). O fluxo pretendido é em cascata, igual
      // ao que advanceGeoLevel já faz pro caminho de geo automática: fechar
      // a cidade sobe pro estado, fechar o estado sobe pro país, fechar o
      // país é que aí sim limpa tudo.
      const manualLabel = cidade || estado || pais;
      list.push({ key: 'manualGeo', label: withGeoFallback(manualLabel as string), action: () => {
        // BUG CORRIGIDO (plano cascata+raio): fechar manualmente cidade/
        // estado precisa limpar lat/lng junto — senão a busca por raio
        // (que só faz sentido junto da cidade que a originou) continuaria
        // filtrando por uma coordenada que não corresponde mais a nada
        // visível na tela.
        if (cidade) {
          applyFilters({ cidade: '', lat: '', lng: '', raio: '' });
        } else if (estado) {
          applyFilters({ estado: '', lat: '', lng: '', raio: '' });
        } else {
          // Último nível (país): usa clearFilters (igual "Limpar Todos").
          // suppressAutoGeo() é essencial aqui — sem ela, assim que
          // pais/estado/cidade ficam vazios na URL, o efeito principal de
          // useAutoGeo.ts (ver BUG CORRIGIDO lá) reaplicava sozinho a mesma
          // geo detectada por IP/GPS, fazendo o filtro "voltar" pro estado
          // anterior um instante depois de parecer limpo.
          suppressAutoGeo();
          try {
            document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            clearGeoCache();
          } catch { /* ignore */ }
          clearFilters();
        }
      }, isGeo: true });
    }

    // BUG CORRIGIDO (validação do zero, rodada 6): "R$" fixo aqui era
    // enganoso — mesmo problema já corrigido em AdsSidebar.tsx (o site tem
    // anúncios reais em ARS/UYU/USD e este filtro compara o valor numérico
    // cru, sem conversão de moeda). Removido pra não afirmar uma moeda
    // errada, igual ao componente irmão.
    if (precoMin && precoMax) list.push({ key: 'preco', label: `${precoMin} - ${precoMax}`, action: () => { setPrice('', ''); }});
    else if (precoMin) list.push({ key: 'precoMin', label: `${T.min} ${precoMin}`, action: () => { setPrice('', precoMax); }});
    else if (precoMax) list.push({ key: 'precoMax', label: `${T.max} ${precoMax}`, action: () => { setPrice(precoMin, ''); }});

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
          onClick={() => {
            // Mesmo BUG CORRIGIDO do ramo 'manualGeo' acima: sem suprimir o
            // auto-geo, a localização detectada por IP/GPS voltava sozinha
            // um instante depois de "Limpar Todos" parecer ter funcionado.
            suppressAutoGeo();
            try {
              document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              clearGeoCache();
            } catch { /* ignore */ }
            clearFilters();
          }}
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
