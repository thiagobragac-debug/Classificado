'use client';

import { useAdsFilters } from '@/lib/useAdsFilters';
import { useLang } from '@/lib/lang-context';
import Link from 'next/link';

// GAP CORRIGIDO (auditoria de usabilidade): só mostrava "Página N", sem
// total nem forma de o usuário saber se está perto do fim da lista.
const TRANSLATIONS = {
  pt: { pageOf: (page: number, total: number) => `Página ${page} de ${total}` },
  es: { pageOf: (page: number, total: number) => `Página ${page} de ${total}` },
};

export default function ListagemPagination({
  hasMore,
  totalPages
}: {
  hasMore: boolean,
  totalPages: number
}) {
  const { page, getPageUrl } = useAdsFilters();
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;

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
          {T.pageOf(page, totalPages)}
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
