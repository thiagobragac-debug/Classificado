'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/lang-context';

// Dummy helper for error logging as a placeholder if it doesn't exist
const logError = (error: any, context: any) => console.error('Logged Error:', error, context);

export default function ListagemError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // BUG CORRIGIDO (auditoria de cobertura de i18n em todas as páginas de
  // cliente, retomada da validação "sem exceção"): error boundary da rota
  // /listagem nunca lia lang - titulo, descricao e os 2 botoes ficavam
  // hardcoded em portugues mesmo com tc_lang=es.
  const { t } = useLang();

  useEffect(() => {
    logError(error, { component: 'ListagemErrorBoundary' });
    fetch('/api/test-error', { method: 'POST', body: error.stack || error.message });
  }, [error]);

  return (
    <div className="container error-page-container">
      <div className="error-page-icon">⚠️</div>
      <h2 className="error-page-title">
        {t('listagem_error_title')}
      </h2>
      <p className="error-page-desc">
        {t('listagem_error_desc')}
      </p>
      <div className="error-page-actions">
        <button
          onClick={() => reset()}
          className="btn btn--primary"
        >
          {t('listagem_error_retry')}
        </button>
        <Link href="/listagem" className="btn btn--outline">
          {t('listagem_error_clear')}
        </Link>
      </div>
    </div>
  );
}
