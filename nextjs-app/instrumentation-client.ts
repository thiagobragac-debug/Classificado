import { SENTRY_DSN_CLIENTE, sentryHabilitado, opcoesComuns } from './sentry.config';

// Instrumentação do lado do browser. Só o NEXT_PUBLIC_SENTRY_DSN vale aqui —
// o DSN do cliente é público por natureza (vai no bundle), diferente de
// qualquer outra credencial do projeto.
//
// O import é dinâmico para o SDK não entrar no bundle de quem não configurou
// Sentry.

if (sentryHabilitado(SENTRY_DSN_CLIENTE)) {
  import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN_CLIENTE,
      ...opcoesComuns,
      // Session Replay desligado: a tela do painel exibe CPF/CNPJ, endereço e
      // documentos de verificação. Gravar isso seria pior que não ter replay.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  });
}

// Necessário para o Next.js reportar transições de rota do App Router.
export async function onRouterTransitionStart(...args: unknown[]) {
  if (!sentryHabilitado(SENTRY_DSN_CLIENTE)) return;
  const Sentry = await import('@sentry/nextjs');
  (Sentry as unknown as { captureRouterTransitionStart: (...a: unknown[]) => void })
    .captureRouterTransitionStart(...args);
}
