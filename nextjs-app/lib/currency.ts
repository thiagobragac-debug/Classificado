// BUG CORRIGIDO (validação do zero, rodada 6): a reescrita de i18n de
// 2026-08-26/27 trocou o mapa estático de símbolos (BRL→'R$', etc.) por
// Intl.NumberFormat(locale, {style:'currency'}).formatToParts()/.format(),
// variando o locale por idioma de exibição (es-AR para espanhol). O
// problema: símbolo de moeda não é uma tradução — é uma convenção
// internacional fixa. es-AR não tem símbolo de BRL nos dados CLDR (BRL não é
// a moeda local da Argentina), então o Intl cai pro próprio código ISO como
// "símbolo": um usuário vendo a página em espanhol via literalmente "BRL
// 160.000,00" em vez de "R$ 160.000,00" em TODA página que mostra preço —
// achado independentemente em /planos, /listagem e /leiloes. O símbolo agora
// vem de um mapa fixo (igual o que já existia certo em FavoritesTab.tsx/
// MyAdsTab.tsx antes da reescrita) — só a formatação do NÚMERO (separador
// decimal/milhar) continua variando por idioma via Intl, que é o único eixo
// em que isso realmente muda entre pt-BR e es.
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: 'US$',
  ARS: 'AR$',
  PYG: '₲',
  UYU: '$U',
};

export function getCurrencySymbol(currency?: string | null): string {
  const code = (currency || 'BRL').toUpperCase();
  if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code];
  // Moeda fora do mapa conhecido: melhor um símbolo aproximado via Intl do
  // que nada, mas isso não deveria acontecer para as moedas hoje em uso
  // (BRL/ARS/UYU/USD).
  try {
    const parts = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumFractionDigits: 0 }).formatToParts(0);
    const symbol = parts.filter(p => p.type === 'currency').map(p => p.value).join('');
    return symbol && symbol !== code ? symbol : code;
  } catch {
    return code;
  }
}

export function formatCurrencyAmount(amount: number, lang: 'pt' | 'es' = 'pt', options?: Intl.NumberFormatOptions): string {
  const locale = lang === 'es' ? 'es-AR' : 'pt-BR';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...options }).format(amount);
}

export function formatPrice(amount: number, currency?: string | null, lang: 'pt' | 'es' = 'pt'): string {
  return `${getCurrencySymbol(currency)} ${formatCurrencyAmount(amount, lang)}`;
}
