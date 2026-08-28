'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logError } from '@/lib/monitoring';
import { useLang } from '@/lib/lang-context';

// BUG CORRIGIDO (revalidação do zero da auditoria de i18n): error boundary
// global de app/(public) inteiro hardcoded em português, sem useLang() em
// lugar nenhum — qualquer erro de renderização em qualquer página do site
// mostrava essa tela sempre em PT.
const TRANSLATIONS = {
  pt: {
    title: 'Ops! Algo não saiu como esperado.',
    body: 'Tivemos um pequeno problema ao carregar esta página. Nossa equipe técnica já foi notificada.',
    retry: 'Tentar Novamente',
    home: 'Voltar ao Início',
  },
  es: {
    title: '¡Ups! Algo no salió como esperado.',
    body: 'Tuvimos un pequeño problema al cargar esta página. Nuestro equipo técnico ya fue notificado.',
    retry: 'Intentar de Nuevo',
    home: 'Volver al Inicio',
  },
} as const;

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useLang();
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // Log estruturado do erro para a telemetria
    logError(error, { route: 'app/(public)' });
  }, [error]);

  return (
    <div className="container" style={{ padding: '8rem 0', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#0f172a' }}>{t.title}</h2>
      <p style={{ color: '#64748b', marginBottom: '2rem', maxWidth: '500px' }}>
        {t.body}
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          className="btn btn--accent"
          style={{ padding: '0.75rem 1.5rem' }}
        >
          {t.retry}
        </button>
        <Link href="/" className="btn btn--outline" style={{ padding: '0.75rem 1.5rem' }}>
          {t.home}
        </Link>
      </div>
    </div>
  );
}
