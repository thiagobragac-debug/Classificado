'use client';

import { useState, useEffect, useCallback } from 'react';
import { rpcToggleFav, getSession } from './supabase';
import { showToast } from './toast';
import { useLang } from './lang-context';

const FAV_KEY = 'tc_favorites';

// BUG CORRIGIDO (auditoria de cobertura de i18n em todas as páginas de
// cliente, retomada da validação "sem exceção"): mensagem de sucesso do
// toast hardcoded em português — o hook não lia lang em lugar nenhum, então
// favoritar um anúncio sempre mostrava esse texto em PT, mesmo com
// tc_lang=es. Chamado por AdSidebar.tsx, RecentAdsSection.tsx,
// FeaturedAdsSection.tsx e AdsGrid.tsx — corrigir aqui dentro (via
// useLang(), que qualquer hook client pode chamar) resolve todos os
// chamadores de uma vez, sem precisar tocar em cada um deles.
const FAV_TOAST = {
  pt: 'Adicionado aos favoritos! Acesse seu painel para não perder esta oferta.',
  es: 'Añadido a favoritos! Accede a tu panel para no perder esta oferta.',
} as const;

export function useFavorites() {
  const { lang } = useLang();
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
    let added = false;
    // 1. Otimistic UI Update
    setFavs(prev => {
      const next = { ...prev };
      if (next[adId]) {
        delete next[adId];
      } else {
        next[adId] = true;
        added = true;
      }
      
      // Sync with localStorage
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(Object.keys(next)));
      } catch { /* ignore */ }
      
      return next;
    });

    if (added) {
      showToast(FAV_TOAST[lang], 'success');
    }

    // 2. Persist in backend if logged in
    try {
      const session = await getSession();
      if (session) {
        await rpcToggleFav(adId);
      }
    } catch (err) {
      console.error('Erro ao favoritar no backend', err);
    }
  }, [lang]);

  return { favs, toggleFav };
}
