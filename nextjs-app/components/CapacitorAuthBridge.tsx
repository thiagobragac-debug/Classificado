'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { getSupabase, NATIVE_GOOGLE_NEXT_KEY } from '@/lib/supabase';
import { getSafeRedirect } from '@/lib/safe-redirect';

// BUG CORRIGIDO (app Android/iOS): metade do fix do login com Google
// dentro do app nativo — a outra metade é lib/supabase.ts::loginWithGoogle,
// que abre a tela de consentimento no navegador do SISTEMA (não na WebView
// do app, que o Google bloqueia) e manda o retorno pro esquema de URL
// customizado do app (br.com.tauzeclass.app://auth-callback) em vez de uma
// URL https normal — só assim o sistema operacional entrega esse retorno
// de volta pro app em vez de deixá-lo preso no navegador do sistema.
//
// Este componente escuta esse retorno (evento nativo 'appUrlOpen', só
// existe dentro do app — nunca dispara no site normal) e termina o login:
// fecha a aba do navegador do sistema, troca o `code` da URL pela sessão
// de verdade (client-side, com o mesmo SDK que já roda no navegador — o
// equivalente do que app/(public)/auth/callback/route.ts faz no servidor
// pro fluxo web, mas aqui não tem como passar pelo servidor: o esquema de
// URL customizado nunca vira uma requisição HTTP, o SO intercepta antes),
// e navega pro destino certo.
//
// Montado no layout raiz (ver app/(public)/layout.tsx) — precisa estar
// ativo o tempo todo, não só na página de login, porque o app pode
// reabrir a partir do retorno do Google com o usuário em qualquer tela.
export function CapacitorAuthBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let ativo = true;

    const handler = async (event: URLOpenListenerEvent) => {
      let url: URL;
      try {
        url = new URL(event.url);
      } catch {
        return;
      }
      // Só nos interessa o retorno específico do login — outros deep links
      // (se algum dia existirem) não devem ser tratados como tentativa de
      // troca de sessão.
      if (url.hostname !== 'auth-callback' && url.pathname !== '/auth-callback') return;

      const code = url.searchParams.get('code');
      // BUG CORRIGIDO (validação da allow-list do Supabase — ver o
      // comentário grande em lib/supabase.ts::loginWithGoogle): o destino
      // pós-login nunca viaja mais na URL (nem como "?next="), pra
      // redirectTo pedido ficar idêntico à entrada exata cadastrada na
      // allow-list. Lido de volta do localStorage, escrito por
      // loginWithGoogle() logo antes de abrir o navegador do sistema.
      let next = '/painel';
      try {
        next = getSafeRedirect(localStorage.getItem(NATIVE_GOOGLE_NEXT_KEY));
        localStorage.removeItem(NATIVE_GOOGLE_NEXT_KEY);
      } catch { /* localStorage indisponível — fica no fallback /painel */ }

      try {
        await Browser.close();
      } catch { /* aba já pode ter fechado sozinha, sem problema */ }

      if (!code) return;

      try {
        const { error } = await getSupabase().auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (ativo) window.location.href = next;
      } catch (err) {
        console.error('[CapacitorAuthBridge] Falha ao trocar code por sessão:', err);
        if (ativo) window.location.href = '/login';
      }
    };

    const listenerPromise = App.addListener('appUrlOpen', handler);

    return () => {
      ativo = false;
      listenerPromise.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
