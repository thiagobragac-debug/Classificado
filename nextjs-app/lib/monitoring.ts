/**
 * Sistema de Monitoramento Centralizado — Tauze Class
 *
 * Integração pronta para Sentry. Para ativar em produção:
 *   1. npm install @sentry/nextjs
 *   2. npx @sentry/wizard@latest -i nextjs
 *   3. Descomentar as linhas Sentry abaixo e remover os console.*
 */

// import * as Sentry from '@sentry/nextjs';

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

    // Sentry — descomentar após instalar @sentry/nextjs:
    // Sentry.captureException(error, { extra: context });
  } else {
    const msg = payload.error?.message || payload.message || 'Unknown error';
    console.error(`[🔴 ERROR]`, msg, context ? `\n[Context]` : '', context || '');
  }
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  const payload = createLogPayload('warn', message, context);

  if (process.env.NODE_ENV === 'production') {
    console.warn(JSON.stringify(payload));
    // Sentry.captureMessage(message, { level: 'warning', extra: context });
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
