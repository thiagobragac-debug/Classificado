/**
 * Sistema de Monitoramento Centralizado
 * Em um ambiente Big Tech, este arquivo integraria com Sentry, Datadog ou LogRocket.
 */

interface ErrorContext {
  userId?: string;
  route?: string;
  params?: Record<string, any>;
  [key: string]: any;
}

export function logError(error: Error | unknown, context?: ErrorContext) {
  // Em produção, enviaríamos para o serviço de observabilidade
  const timestamp = new Date().toISOString();
  
  const errorObj = error instanceof Error ? {
    message: error.message,
    stack: error.stack,
    name: error.name
  } : {
    message: String(error)
  };

  const logPayload = {
    level: 'error',
    timestamp,
    error: errorObj,
    context: context || {}
  };

  // Simulação de envio para serviço (Sentry/Datadog)
  if (process.env.NODE_ENV === 'production') {
    // console.log para stdout, que seria capturado pelo CloudWatch ou Datadog Agent
    console.error(JSON.stringify(logPayload));
    
    // Sentry.captureException(error, { extra: context });
  } else {
    // Desenvolvimento: Log legível
    console.error(`[🔴 ERROR MONITORING]`, errorObj.message);
    if (context) console.error(`[Context]`, context);
  }
}

export function logInfo(message: string, context?: Record<string, any>) {
  if (process.env.NODE_ENV === 'production') {
    console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), context }));
  } else {
    console.info(`[🔵 INFO]`, message, context || '');
  }
}
