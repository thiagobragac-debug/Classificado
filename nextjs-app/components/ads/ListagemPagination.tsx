'use client';

import { useAdsFilters } from '@/lib/useAdsFilters';
import Link from 'next/link';

export default function ListagemPagination({ 
  hasMore 
}: { 
  hasMore: boolean 
}) {
  const { page, getPageUrl } = useAdsFilters();

  return (
    <div style={{ marginTop: 'auto', paddingTop: 'var(--sp-10)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-4)', background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--clr-border)' }}>
        {page === 1 ? (
          <span 
            className="btn btn--ghost-dark btn--sm"
            style={{ opacity: 0.4, pointerEvents: 'none' }}
          >
            ← Anterior
          </span>
        ) : (
          <Link 
            href={getPageUrl(page - 1)}
            className="btn btn--ghost-dark btn--sm"
          >
            ← Anterior
          </Link>
        )}
        
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--clr-text)' }}>
          Página {page}
        </span>

        {!hasMore ? (
          <span 
            className="btn btn--ghost-dark btn--sm"
            style={{ opacity: 0.4, pointerEvents: 'none' }}
          >
            Próxima →
          </span>
        ) : (
          <Link 
            href={getPageUrl(page + 1)}
            className="btn btn--ghost-dark btn--sm"
          >
            Próxima →
          </Link>
        )}
      </div>
    </div>
  );
}
