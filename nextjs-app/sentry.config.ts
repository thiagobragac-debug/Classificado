// Configuração compartilhada do Sentry.
//
// Tudo aqui é inerte sem SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN: sem a variável o
// SDK não é inicializado e a aplicação se comporta exatamente como antes. Isso
// permite versionar a instrumentação sem exigir que todos os ambientes (CI,
// preview, máquina de quem desenvolve) tenham um projeto Sentry.

export const SENTRY_DSN_SERVIDOR = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '';
export const SENTRY_DSN_CLIENTE = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export const sentryHabilitado = (dsn: string) => Boolean(dsn);

export const opcoesComuns = {
  environment: process.env.NODE_ENV,
  // Amostragem de performance: 10% em produção é o suficiente para enxergar
  // tendência sem estourar cota. Em desenvolvimento, tudo.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Não enviar corpo de requisição nem cookies: passam CPF/CNPJ, endereço e
  // token de sessão. O que interessa é o stack, não o payload.
  sendDefaultPii: false,
};
