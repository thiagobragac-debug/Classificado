'use client';

import { useState, useEffect, useCallback } from 'react';
import { rpcToggleFav, getSession } from './supabase';
import { showToast } from './toast';

const FAV_KEY = 'tc_favorites';

export function useFavorites() {
  const [favs, setFavs] = useState<Record<string, boolean>>({});

  // Carregar favoritos iniciais do localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const map: Record<string, boolean> = {};
          parsed.forEach(id => map[id] = true);
          setFavs(map);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const toggleFav = useCallback(async (adId: string) => {
    // 1. Otimistic UI Update
    setFavs(prev => {
      const next = { ...prev };
      if (next[adId]) {
        delete next[adId];
      } else {
        next[adId] = true;
        showToast('Adicionado aos favoritos! Acesse seu painel para não perder esta oferta.', 'success');
      }
      
      // Sync with localStorage
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(Object.keys(next)));
      } catch { /* ignore */ }
      
      return next;
    });

    // 2. Persist in backend if logged in
    try {
      const session = await getSession();
      if (session) {
        await rpcToggleFav(adId);
      }
    } catch (err) {
      console.error('Erro ao favoritar no backend', err);
    }
  }, []);

  return { favs, toggleFav };
}
