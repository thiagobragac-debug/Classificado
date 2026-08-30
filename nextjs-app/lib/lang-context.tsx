'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { Lang } from '@/lib/constants';
import { I18N } from '@/lib/constants';

interface LangContextValue {
  lang: Lang;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'pt',
  t: (k) => k,
});

// BUG CRÍTICO CORRIGIDO (migração de SEO para URLs de idioma reais): este
// provider ANTES mantinha seu PRÓPRIO estado de idioma (useState) e um
// setLang() que só trocava cookie/localStorage + router.refresh() — nunca
// navegava pra URL nenhuma. Era exatamente o achado "seletor de idioma sem
// href" da auditoria: zero URL seguível, zero descoberta orgânica do
// conteúdo em ES por link algum. Agora `lang` vem DIRETO de `initialLang`
// (por sua vez lido de getLocale()/x-locale em app/(public)/layout.tsx, a
// única fonte de verdade — ver lib/locale-server.ts) — a troca de idioma
// é uma navegação real (Header.tsx/LangToggle.tsx agora usam
// switchLocalePath() + <Link>, não mais setLang()), então uma NOVA
// requisição já chega aqui com o `initialLang` certo. Sem useState, sem
// leitura de localStorage: a URL manda, ponto final.
export function LangProvider({ children, initialLang }: { children: React.ReactNode, initialLang?: Lang }) {
  const lang = initialLang || 'pt';

  const t = useCallback((key: string): string => {
    return (I18N[lang] as Record<string, string>)[key] ?? key;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
