import type { Lang } from './constants';

// Funções PURAS de manipulação de path por locale — sem import de
// next/headers de propósito, pra este arquivo poder ser usado tanto em
// Server Components quanto em Client Components (ex.: o seletor de idioma
// do Header, que precisa calcular o link de destino no navegador). A versão
// que lê o locale ATIVO da requisição (via header x-locale, setado por
// proxy.ts) fica em lib/locale-server.ts, que só Server Components podem
// importar.

// BUG CORRIGIDO (auditoria de SEO): cada página pública declarava sua PRÓPRIA
// cópia de `const SITE_URL = 'https://tauzeclass.com.br'` (12 arquivos,
// confirmado via grep) — hardcoded, divergente de app/sitemap.ts e
// app/robots.ts, que sempre leram `process.env.NEXT_PUBLIC_SITE_URL` (com o
// mesmo fallback). Em produção com o domínio de hoje o efeito é nulo, mas
// qualquer ambiente com domínio diferente (preview, staging, uma futura
// troca de domínio) faria canonical/OG apontarem pra produção enquanto
// sitemap/robots seguiriam corretamente a env var — uma divergência interna
// silenciosa. Centralizado aqui (mesmo módulo que já concentra a lógica de
// URL por locale) para as páginas importarem em vez de redeclarar o literal.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tauzeclass.com.br';

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
 * Querystring a anexar no link do seletor de idioma (além do path calculado
 * por switchLocalePath). BUG CORRIGIDO (seletor PT não fazia nada quando o
 * cookie/geo já apontava pra ES): diferente de ES, que tem o prefixo /es como
 * sinal inequívoco de URL, PT não tem prefixo nenhum — uma navegação pra '/'
 * é ambígua entre "visitante novo, use o cookie/geo salvo" e "acabei de
 * clicar em PT no seletor". Sem este parâmetro, o redirect automático de
 * proxy.ts (cookie/geo apontando pra es) devolvia o visitante pra /es antes
 * do cookie sequer ter chance de virar 'pt' — o clique no seletor parecia
 * simplesmente não ter efeito. proxy.ts resolve e remove este parâmetro da
 * URL antes de qualquer outra decisão de locale, atualizando o cookie no
 * mesmo redirect.
 */
export function switchLocaleQuery(targetLocale: Lang, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set('setLocale', targetLocale);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
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
