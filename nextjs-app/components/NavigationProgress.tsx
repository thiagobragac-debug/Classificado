'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Barra de progresso no topo durante navegações entre páginas. Todas as
// páginas públicas são renderizadas no servidor a cada visita (CSP com nonce
// impede cache estático) e, no Render Free Tier, isso leva de 0,3s a 1,5s —
// durante esse tempo a tela antiga fica parada e o clique parece não ter
// feito nada (relato: "tem que clicar 2 vezes", "todas as abas lentas").
// Não dá pra resolver com loading.tsx em rotas que usam notFound() (soft-404,
// ver components/ads/LinkPendingOverlay.tsx), então o retorno visual é global
// e vem do cliente: começa no clique em qualquer link interno e termina
// quando o pathname/querystring muda.
function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rota mudou = navegação concluída.
  useEffect(() => {
    setActive(false);
    if (safety.current) clearTimeout(safety.current);
  }, [routeKey]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target as Element | null;
      // Botão dentro de um card-link (ex.: favoritar) não navega.
      if (el?.closest?.('button')) return;
      const a = el?.closest?.('a');
      if (!a || !a.href) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      // Mesma página (inclui só troca de #hash): nada vai carregar.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
      // Rede de segurança: se a rota nunca mudar (erro, clique cancelado), some sozinha.
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setActive(false), 10000);
    };
    // Fase de CAPTURA: o next/link chama preventDefault() no próprio onClick
    // (fase de bolha), então um listener comum sempre veria defaultPrevented.
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (safety.current) clearTimeout(safety.current);
    };
  }, []);

  return <div className={`nav-progress${active ? ' nav-progress--on' : ''}`} aria-hidden="true" />;
}


// useSearchParams exige Suspense; o fallback nulo é intencional (a barra é
// puramente decorativa, não pode bloquear nem esconder nada).
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
