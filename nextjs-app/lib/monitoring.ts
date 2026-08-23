/**
 * Sistema de Monitoramento Centralizado — Tauze Class
 *
 * O Sentry está instalado e instrumentado (instrumentation.ts e
 * instrumentation-client.ts). Ele só é ativado quando há DSN configurado:
 *
 *   SENTRY_DSN=...              (servidor)
 *   NEXT_PUBLIC_SENTRY_DSN=...  (browser)
 *
 * Sem DSN o comportamento é o mesmo de antes — apenas os console.*. Com DSN,
 * os erros também chegam ao Sentry, sem nenhuma mudança nos chamadores.
 */

import { SENTRY_DSN_SERVIDOR, SENTRY_DSN_CLIENTE, sentryHabilitado } from '@/sentry.config';

// Envio best-effort: uma falha ao reportar erro não pode virar um segundo erro
// e derrubar o fluxo que estava apenas logando.
function enviarAoSentry(acao: (sentry: typeof import('@sentry/nextjs')) => void) {
  const dsn = typeof window === 'undefined' ? SENTRY_DSN_SERVIDOR : SENTRY_DSN_CLIENTE;
  if (!sentryHabilitado(dsn)) return;
  import('@sentry/nextjs').then(acao).catch(() => {});
}

interface ErrorContext {
  userId?: string;
  route?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

interface LogPayload {
  level: 'error' | 'warn' | 'info';
  timestamp: string;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  message?: string;
  context: ErrorContext | Record<string, unknown>;
}

function createLogPayload(level: LogPayload['level'], errorOrMessage: Error | unknown | string, context?: Record<string, unknown>): LogPayload {
  const timestamp = new Date().toISOString();

  if (typeof errorOrMessage === 'string') {
    return { level, timestamp, message: errorOrMessage, context: context || {} };
  }

  let errorObj: any;
  if (errorOrMessage instanceof Error) {
    errorObj = { message: errorOrMessage.message, stack: errorOrMessage.stack, name: errorOrMessage.name };
  } else if (typeof errorOrMessage === 'object' && errorOrMessage !== null) {
    errorObj = errorOrMessage; // Pass the whole object (e.g. PostgrestError)
  } else {
    errorObj = { message: String(errorOrMessage) };
  }

  return { level, timestamp, error: errorObj, context: context || {} };
}

export function logError(error: Error | unknown, context?: ErrorContext) {
  const payload = createLogPayload('error', error, context);

  if (process.env.NODE_ENV === 'production') {
    // Stdout capturado pelo CloudWatch / Datadog Agent / Vercel Logs
    console.error(JSON.stringify(payload));

    enviarAoSentry(s => s.captureException(error, { extra: context }));
  } else {
    const msg = payload.error?.message || payload.message || 'Unknown error';
    console.error(`[🔴 ERROR]`, msg, context ? `\n[Context]` : '', context || '');
  }
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  const payload = createLogPayload('warn', message, context);

  if (process.env.NODE_ENV === 'production') {
    console.warn(JSON.stringify(payload));
    enviarAoSentry(s => s.captureMessage(message, { level: 'warning', extra: context }));
  } else {
    console.warn(`[🟡 WARN]`, message, context || '');
  }
}

export function logInfo(message: string, context?: Record<string, unknown>) {
  const payload = createLogPayload('info', message, context);

  if (process.env.NODE_ENV === 'production') {
    console.info(JSON.stringify(payload));
  } else {
    console.info(`[🔵 INFO]`, message, context || '');
  }
}
