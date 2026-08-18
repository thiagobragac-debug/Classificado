'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Dummy helper for error logging as a placeholder if it doesn't exist
const logError = (error: any, context: any) => console.error('Logged Error:', error, context);

export default function ListagemError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { component: 'ListagemErrorBoundary' });
    fetch('/api/test-error', { method: 'POST', body: error.stack || error.message });
  }, [error]);

  return (
    <div className="container error-page-container">
      <div className="error-page-icon">⚠️</div>
      <h2 className="error-page-title">
        Algo deu errado ao carregar os anúncios!
      </h2>
      <p className="error-page-desc">
        Pode ter havido uma falha na conexão ou os filtros aplicados geraram um erro inesperado. Tente redefinir os filtros ou recarregar a página.
      </p>
      <div className="error-page-actions">
        <button
          onClick={() => reset()}
          className="btn btn--primary"
        >
          Tentar novamente
        </button>
        <Link href="/listagem" className="btn btn--outline">
          Limpar Filtros e Voltar
        </Link>
      </div>
    </div>
  );
}
