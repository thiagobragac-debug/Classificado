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
  }, [error]);

  return (
    <div className="container" style={{ padding: '6rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
      <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--clr-text)' }}>
        Algo deu errado ao carregar os anúncios!
      </h2>
      <p style={{ color: 'var(--clr-text-muted)', marginBottom: '2rem', maxWidth: '500px' }}>
        Pode ter havido uma falha na conexão ou os filtros aplicados geraram um erro inesperado. Tente redefinir os filtros ou recarregar a página.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
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
