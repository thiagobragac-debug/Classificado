'use client';

import { useState, useEffect, useCallback } from 'react';

const RECENT_KEY = 'tc_recent_views';
const MAX_RECENT = 10;

export interface RecentAd {
  id: string;
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
        setRecentViews(JSON.parse(stored));
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
