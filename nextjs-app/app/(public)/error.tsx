'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logError } from '@/lib/monitoring';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log estruturado do erro para a telemetria
    logError(error, { route: 'app/(public)' });
  }, [error]);

  return (
    <div className="container" style={{ padding: '8rem 0', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#0f172a' }}>Ops! Algo não saiu como esperado.</h2>
      <p style={{ color: '#64748b', marginBottom: '2rem', maxWidth: '500px' }}>
        Tivemos um pequeno problema ao carregar esta página. Nossa equipe técnica já foi notificada.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          className="btn btn--accent"
          style={{ padding: '0.75rem 1.5rem' }}
        >
          Tentar Novamente
        </button>
        <Link href="/" className="btn btn--outline" style={{ padding: '0.75rem 1.5rem' }}>
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}
