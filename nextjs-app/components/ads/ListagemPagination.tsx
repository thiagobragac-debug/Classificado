'use client';

import { useAdsFilters } from '@/lib/useAdsFilters';
import { useLang } from '@/lib/lang-context';
import Link from 'next/link';

export default function ListagemPagination({
  hasMore
}: {
  hasMore: boolean
}) {
  const { page, getPageUrl } = useAdsFilters();
  const { t } = useLang();

  return (
    <div style={{ marginTop: 'auto', paddingTop: 'var(--sp-10)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-4)', background: 'white', borderRadius: 'var(--r-lg)', border: '1px solid var(--clr-border)' }}>
        {page === 1 ? (
          <span
            className="btn btn--ghost-dark btn--sm"
            style={{ opacity: 0.4, pointerEvents: 'none' }}
          >
            ← {t('pagination_prev')}
          </span>
        ) : (
          <Link
            href={getPageUrl(page - 1)}
            className="btn btn--ghost-dark btn--sm"
          >
            ← {t('pagination_prev')}
          </Link>
        )}

        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--clr-text)' }}>
          {t('pagination_page')} {page}
        </span>

        {!hasMore ? (
          <span
            className="btn btn--ghost-dark btn--sm"
            style={{ opacity: 0.4, pointerEvents: 'none' }}
          >
            {t('pagination_next')} →
          </span>
        ) : (
          <Link
            href={getPageUrl(page + 1)}
            className="btn btn--ghost-dark btn--sm"
          >
            {t('pagination_next')} →
          </Link>
        )}
      </div>
    </div>
  );
}
