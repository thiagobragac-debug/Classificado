'use client';

import { useLinkStatus } from 'next/link';

// Retorno visual imediato ao clicar num anúncio. /anuncio/[slug] é dinâmica
// e NÃO pode ter loading.tsx (um Suspense de rota trava o status HTTP em
// 200 antes do notFound() rodar — anúncio inexistente viraria soft-404 pro
// Google, confirmado ao vivo em 2026-10-12). Sem loading.tsx a tela antiga
// fica parada ~1-2s até o servidor responder, o clique parecia não ter
// pegado e o usuário clicava de novo ("tem que clicar 2 vezes"). Este
// componente vive DENTRO do <Link> (exigência do useLinkStatus) e cobre o
// card com um spinner enquanto a navegação está pendente. Só aparece depois
// de ~120ms (CSS), então navegação rápida/prefetchada não pisca.
export function LinkPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="link-pending-overlay" aria-hidden="true" />;
}
