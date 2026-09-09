'use client';

import { createContext, useContext } from 'react';
import { Category } from './AdCard';
import type { GeoFallbackInfo } from '@/lib/geo-cascade';

export interface AdsFilterContextType {
  lang: string;
  categories: Category[];
  subcategories: { id: string; name_pt: string; name_es?: string | null }[];
  subcategoryCounts: Record<string, number>;
  countries: string[];
  states: string[];
  cities: string[];
  
  hasFilters: boolean;
  clearFilters: () => void;
  applyFilters: (overrides?: any) => void;
  handleSearch: (v: string) => void;
  
  busca: string;
  categoria: string;
  setCategoria: (v: string) => void;
  subcategoria: string;
  setSubcategoria: (v: string) => void;
  toggleSubcategoria: (v: string) => void;
  finalidade: string;
  setFinalidade: (v: string) => void;

  pais: string;
  setPais: (v: string) => void;
  estado: string;
  setEstado: (v: string) => void;
  cidade: string;
  setCidade: (v: string) => void;
  // Coordenadas da busca "Perto de você" (ver lib/useAutoGeo.ts) e raio em
  // KM escolhido manualmente (ver AdsSidebar.tsx) — lat/lng só existem
  // quando a localização foi auto-detectada; raio sobrescreve a escada
  // automática 100km->300km com um valor fixo.
  lat: string;
  lng: string;
  raio: string;
  setRaio: (v: string) => void;

  precoMin: string;
  setPrecoMin: (v: string) => void;
  precoMax: string;
  setPrecoMax: (v: string) => void;
  setPrice: (min: string, max: string) => void;
  
  destaque: boolean;
  setDestaque: (v: boolean) => void;
  negociavel: boolean;
  setNegociavel: (v: boolean) => void;

  // Presente só quando a busca geográfica ampliou sozinha (cidade sem
  // anúncio → estado/país/tudo, ver getAdsListagemComFallbackGeografico em
  // lib/services/ads.service.ts). AdsSidebar usa pra não mostrar país/
  // estado/cidade/raio como uma restrição real em vigor quando na prática
  // já foi superada.
  geoFallback?: GeoFallbackInfo | null;
}

export const AdsFilterContext = createContext<AdsFilterContextType | null>(null);

export function useAdsFilter() {
  const context = useContext(AdsFilterContext);
  if (!context) {
    throw new Error('useAdsFilter must be used within an AdsFilterContext.Provider');
  }
  return context;
}
