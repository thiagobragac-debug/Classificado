import type { Instrumentation } from 'next';
import { SENTRY_DSN_SERVIDOR, sentryHabilitado, opcoesComuns } from './sentry.config';

// Convenção do Next.js 16: `register` roda uma vez por instância de servidor,
// antes de atender qualquer requisição. `onRequestError` recebe os erros que o
// servidor captura, incluindo os de Server Components.
//
// Sem DSN configurado nada é inicializado — a aplicação segue idêntica.

export async function register() {
  if (!sentryHabilitado(SENTRY_DSN_SERVIDOR)) return;

  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn: SENTRY_DSN_SERVIDOR, ...opcoesComuns });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!sentryHabilitado(SENTRY_DSN_SERVIDOR)) return;

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
