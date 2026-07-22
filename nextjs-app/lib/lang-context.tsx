'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pt');

  useEffect(() => {
    // Lê o idioma salvo no localStorage (mesmo comportamento do main.js original)
    const saved = localStorage.getItem('tc_lang') as Lang | null;
    if (saved === 'es' || saved === 'pt') {
      setLangState(saved);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('tc_lang', l);
    document.documentElement.lang = l === 'es' ? 'es' : 'pt-BR';
  }, []);

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
