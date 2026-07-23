'use client';

import { createContext, useContext } from 'react';
import { Category } from './AdCard';

export interface AdsFilterContextType {
  lang: string;
  categories: Category[];
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
  
  pais: string;
  setPais: (v: string) => void;
  estado: string;
  setEstado: (v: string) => void;
  cidade: string;
  setCidade: (v: string) => void;
  
  precoMin: string;
  setPrecoMin: (v: string) => void;
  precoMax: string;
  setPrecoMax: (v: string) => void;
  setPrice: (min: string, max: string) => void;
  
  destaque: boolean;
  setDestaque: (v: boolean) => void;
  negociavel: boolean;
  setNegociavel: (v: boolean) => void;
}

export const AdsFilterContext = createContext<AdsFilterContextType | null>(null);

export function useAdsFilter() {
  const context = useContext(AdsFilterContext);
  if (!context) {
    throw new Error('useAdsFilter must be used within an AdsFilterContext.Provider');
  }
  return context;
}
