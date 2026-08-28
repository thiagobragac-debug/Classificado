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
    //
    // BUG CORRIGIDO (aplicação de todos os achados de baixa prioridade
    // pendentes, achado independentemente por 3 agentes de revisão
    // adversarial): a condição `!initialLang` nunca é verdadeira na
    // prática — app/(public)/layout.tsx sempre passa initialLang como
    // 'pt' ou o valor do cookie, nunca vazio
    // (cookieStore.get('tc_lang')?.value || 'pt') — então este bloco nunca
    // de fato sincronizava nada; o cookie sempre vencia sobre o
    // localStorage no carregamento, mesmo quando divergiam (ex.: cookie
    // limpo por uma extensão de privacidade ou aba anônima que preserva
    // localStorage, ou um valor salvo de antes deste sistema de cookie
    // existir). Agora aplica o valor salvo sempre que ele diverge do
    // estado atual, e também escreve o cookie de volta + chama
    // router.refresh(), mesmo efeito colateral que setLang() já produz
    // numa troca manual — sem isso, os Server Components (que leem o
    // idioma via cookie, não localStorage) ficariam no idioma antigo
    // enquanto o client já mudou, recriando o "PT/ES misturado" que
    // setLang() foi corrigido pra evitar.
    const saved = localStorage.getItem('tc_lang') as Lang | null;
    if ((saved === 'es' || saved === 'pt') && saved !== lang) {
      setLangState(saved);
      document.cookie = `tc_lang=${saved}; path=/; max-age=31536000`;
      document.documentElement.lang = saved === 'es' ? 'es' : 'pt-BR';
      router.refresh();
    }
  }, [lang, router]);

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
