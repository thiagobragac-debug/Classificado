/* ================================================================
   TAUZE CLASS — Error Monitor v2
   Captura erros silenciosos e os loga de forma estruturada.
   Integração Sentry lazy: carrega o SDK apenas se um DSN
   estiver configurado no admin (via platform_settings → sentry_dsn).
   Sem DSN → zero impacto em performance.
   ================================================================ */

(function initErrorMonitor() {
  const _errors = [];
  const MAX_ERRORS = 50;

  function formatError(info) {
    return {
      ts:      new Date().toISOString(),
      url:     window.location.href,
      ua:      navigator.userAgent.substring(0, 100),
      ...info,
    };
  }

  function report(entry) {
    _errors.push(entry);
    if (_errors.length > MAX_ERRORS) _errors.shift();

    // Log estruturado no console (visível em DevTools → Console)
    console.error('[TauzeClass Error]', entry);

    // Salva no sessionStorage para debug
    try {
      sessionStorage.setItem('tc_errors', JSON.stringify(_errors.slice(-10)));
    } catch (_) {}

    // Encaminha para Sentry se o SDK já foi carregado
    if (window.Sentry) {
      try {
        window.Sentry.captureException(
          new Error(entry.message || String(entry.type)),
          { extra: entry }
        );
      } catch (_) {}
    }
  }

  // Captura erros JS não tratados
  window.addEventListener('error', (e) => {
    report({
      type:    'uncaught',
      message: e.message,
      file:    e.filename,
      line:    e.lineno,
      col:     e.colno,
      stack:   e.error?.stack?.substring(0, 500),
    });
  });

  // Captura Promises rejeitadas sem .catch()
  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason;
    report({
      type:    'unhandled_promise',
      message: err?.message || String(err),
      stack:   err?.stack?.substring(0, 500),
    });
  });

  // Expõe função para logging manual em qualquer parte do código
  window.tcLogError = function(context, error) {
    const userId = (() => {
      try {
        const raw = localStorage.getItem('tc_user_initials');
        return raw || 'anon';
      } catch (_) { return 'anon'; }
    })();

    report({
      type:    'manual',
      context,
      user_id: userId,
      message: error?.message || String(error),
      stack:   error?.stack?.substring(0, 300),
    });
  };

  // Expõe histórico de erros para debug no console: tcGetErrors()
  window.tcGetErrors = () => [..._errors];

  // ── Sentry — Carregamento LAZY ──────────────────────────────────
  // O SDK só é carregado se houver um DSN configurado no admin.
  // Consulta o localStorage (populado por syncPlatformSettings).
  // Assim, páginas sem DSN configurado não carregam nenhum script extra.
  function tryLoadSentry() {
    const dsn = localStorage.getItem('tc_sentry_dsn');
    if (!dsn || dsn.trim() === '' || window.Sentry) return;

    const script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.x.x/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.Sentry && window.Sentry.init) {
        window.Sentry.init({
          dsn,
          environment:  location.hostname === 'localhost' ? 'development' : 'production',
          tracesSampleRate: 0.2, // 20% das transações — evita exceder cota gratuita
          ignoreErrors: [
            // Erros externos não acionáveis
            'ResizeObserver loop',
            'Non-Error promise rejection',
            'Network Error',
          ],
        });
        console.log('[TauzeClass] Sentry inicializado.');
      }
    };
    script.onerror = () => console.warn('[TauzeClass] Falha ao carregar SDK do Sentry.');
    document.head.appendChild(script);
  }

  // Aguarda o DOM para garantir que syncPlatformSettings já rodou
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoadSentry);
  } else {
    // Pequeno delay para ceder precedência ao carregamento principal
    setTimeout(tryLoadSentry, 1500);
  }

  console.log('[TauzeClass] Error monitor v2 iniciado.');
})();
