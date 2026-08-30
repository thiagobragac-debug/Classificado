import type { Lang } from './constants';

// Funções PURAS de manipulação de path por locale — sem import de
// next/headers de propósito, pra este arquivo poder ser usado tanto em
// Server Components quanto em Client Components (ex.: o seletor de idioma
// do Header, que precisa calcular o link de destino no navegador). A versão
// que lê o locale ATIVO da requisição (via header x-locale, setado por
// proxy.ts) fica em lib/locale-server.ts, que só Server Components podem
// importar.

const LOCALE_PREFIX = '/es';

/** Remove o prefixo /es de um path, se houver. Espelha proxy.ts (stripLocalePrefix). */
export function stripLocale(path: string): string {
  if (path === LOCALE_PREFIX) return '/';
  if (path.startsWith(`${LOCALE_PREFIX}/`)) return path.slice(LOCALE_PREFIX.length);
  return path;
}

/** Aplica o prefixo /es a um path (já sem prefixo) quando locale === 'es'. Espelha proxy.ts (withLocale). */
export function localizedPath(path: string, locale: Lang): string {
  if (locale !== 'es') return path;
  return path === '/' ? LOCALE_PREFIX : `${LOCALE_PREFIX}${path}`;
}

/**
 * Calcula o path de destino ao trocar de idioma a partir do path ATUAL
 * (que pode ou não já ter o prefixo /es) — usado pelo seletor de idioma do
 * Header pra virar um <Link href> real, em vez de só trocar um cookie sem
 * navegar (BUG CORRIGIDO, auditoria de SEO: o seletor não gerava nenhuma
 * URL seguível, zero descoberta orgânica do conteúdo em ES por link).
 */
export function switchLocalePath(currentPath: string, targetLocale: Lang): string {
  return localizedPath(stripLocale(currentPath), targetLocale);
}

/**
 * Constrói o par de URLs alternates.languages (pt-BR/es/x-default) para uma
 * rota pública, dado o path SEM prefixo (ex.: '/anuncio/abc123') e o
 * domínio base — mesmo padrão repetido em toda página com generateMetadata
 * antes desta migração, agora centralizado num único lugar.
 */
export function buildHreflangAlternates(siteUrl: string, path: string) {
  const ptUrl = `${siteUrl}${path}`;
  const esUrl = `${siteUrl}${localizedPath(path, 'es')}`;
  return {
    'pt-BR': ptUrl,
    es: esUrl,
    'x-default': ptUrl,
  };
}
