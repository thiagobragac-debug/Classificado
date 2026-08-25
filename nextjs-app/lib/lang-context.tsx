'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/constants';
import { I18N } from '@/lib/constants';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'pt',
  setLang: () => {},
  t: (k) => k,
});

export function LangProvider({ children, initialLang }: { children: React.ReactNode, initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang || 'pt');
  const router = useRouter();

  useEffect(() => {
    // Lê o idioma salvo no localStorage (mesmo comportamento do main.js original)
    const saved = localStorage.getItem('tc_lang') as Lang | null;
    if (saved === 'es' || saved === 'pt') {
      if (!initialLang && saved !== lang) {
        setLangState(saved);
      }
    }
  }, [initialLang, lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('tc_lang', l);
    document.cookie = `tc_lang=${l}; path=/; max-age=31536000`;
    document.documentElement.lang = l === 'es' ? 'es' : 'pt-BR';
    // BUG CORRIGIDO (reteste do site, 2026-08-25): trocar idioma só
    // atualizava estado do cliente + cookie, sem nunca re-renderizar as
    // Server Components (Hero, Categorias, Confiança etc.) que leem o
    // idioma via cookies() no momento do request — a home ficava com PT/ES
    // misturado até um F5 manual. router.refresh() reexecuta os Server
    // Components da rota atual com o cookie novo, sem perder o estado do
    // client (scroll, formulários abertos) nem navegar pra outra URL.
    router.refresh();
  }, [router]);

  const t = useCallback((key: string): string => {
    return (I18N[lang] as Record<string, string>)[key] ?? key;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
