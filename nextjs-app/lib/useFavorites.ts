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

// BUG CORRIGIDO (varredura cruzada de cenários): a mensagem acima promete
// persistência ("acesse seu painel") e é mostrada IGUAL pra visitante
// deslogado — que só grava em localStorage (o RPC só roda "if session"),
// então a promessa não se sustenta (o favorito some ao trocar de
// dispositivo/navegador ou limpar dados do site) e "seu painel" nem é
// acessível sem login.
const FAV_TOAST_GUEST = {
  pt: 'Adicionado aos favoritos neste dispositivo. Faça login para não perder esta oferta.',
  es: 'Añadido a favoritos en este dispositivo. Inicia sesión para no perder esta oferta.',
} as const;

const FAV_SYNC_ERROR = {
  pt: 'Favorito salvo neste dispositivo, mas houve um erro ao sincronizar com sua conta.',
  es: 'Favorito guardado en este dispositivo, pero hubo un error al sincronizar con tu cuenta.',
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
    // BUG CORRIGIDO (varredura cruzada de cenários): a sessão só era
    // checada DEPOIS do toast de sucesso já ter disparado — a mesma
    // mensagem (prometendo persistência) aparecia pra logado e deslogado.
    // Checar antes permite escolher o texto certo pra cada caso.
    const session = await getSession();

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
      showToast(session ? FAV_TOAST[lang] : FAV_TOAST_GUEST[lang], 'success');
    }

    // 2. Persist in backend if logged in
    if (session) {
      try {
        await rpcToggleFav(adId);
      } catch (err) {
        console.error('Erro ao favoritar no backend', err);
        // BUG CORRIGIDO (varredura cruzada de cenários): falha real de
        // persistência (sessão presente, mas a chamada falhou) era só
        // logada no console — o usuário continuava vendo "Adicionado aos
        // favoritos!" mesmo quando nada foi salvo no servidor, e só
        // descobriria a divergência numa sessão futura em outro
        // dispositivo.
        if (added) showToast(FAV_SYNC_ERROR[lang], 'warning');
      }
    }
  }, [lang]);

  return { favs, toggleFav };
}
