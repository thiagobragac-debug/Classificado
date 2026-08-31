'use client';

import { useState, useEffect, useCallback } from 'react';

const RECENT_KEY = 'tc_recent_views';
const MAX_RECENT = 10;

export interface RecentAd {
  id: string;
  slug: string;
  title_pt: string;
  title_es: string;
  price: number;
  currency: string;
  price_unit_pt: string;
  negotiable: boolean;
  images: string[];
  category_id: string;
  country: string;
  state: string;
  city: string;
  created_at: string;
  featured: boolean;
}

export function useRecentViews() {
  const [recentViews, setRecentViews] = useState<RecentAd[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed: RecentAd[] = JSON.parse(stored);
        // BUG CORRIGIDO (achado na revisão pós-merge da migração de slug):
        // localStorage é do NAVEGADOR, não do banco — uma entrada gravada
        // antes desta migração (por qualquer visitante real que já tivesse
        // usado o site) não tem `slug` nenhum, e sem esse filtro virava um
        // link quebrado ("/anuncio/undefined") na seção "Vistos
        // Recentemente" até a pessoa visitar aquele mesmo anúncio de novo.
        // Sem como recuperar o slug aqui (custaria um round-trip ao banco só
        // pra isso); descartar a entrada obsoleta é mais seguro que arriscar
        // um link quebrado — ela reaparece corretamente na próxima vez que o
        // anúncio for visitado (recordView já grava o slug real).
        const valid = parsed.filter((ad) => !!ad?.slug);
        setRecentViews(valid);
        if (valid.length !== parsed.length) {
          localStorage.setItem(RECENT_KEY, JSON.stringify(valid));
        }
      }
    } catch { /* ignore */ }
  }, []);

  const recordView = useCallback((ad: any) => {
    try {
      let stored: RecentAd[] = [];
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) stored = JSON.parse(raw);

      // Filter out if already exists
      stored = stored.filter(a => a.id !== ad.id);
      
      const newAd: RecentAd = {
        id: ad.id,
        slug: ad.slug,
        title_pt: ad.title_pt,
        title_es: ad.title_es,
        price: ad.price,
        currency: ad.currency,
        price_unit_pt: ad.price_unit_pt,
        negotiable: ad.negotiable,
        images: ad.images || [],
        category_id: ad.category_id,
        country: ad.country,
        state: ad.state,
        city: ad.city,
        created_at: ad.created_at,
        featured: ad.featured || false
      };

      stored.unshift(newAd);
      if (stored.length > MAX_RECENT) {
        stored = stored.slice(0, MAX_RECENT);
      }

      localStorage.setItem(RECENT_KEY, JSON.stringify(stored));
      setRecentViews(stored);
    } catch { /* ignore */ }
  }, []);

  return { recentViews, recordView };
}
