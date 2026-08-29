import type { Metadata } from 'next';

// Página transacional (pós-checkout) — não deve ser indexada. page.tsx é
// 'use client' e por isso não pode exportar `metadata`/`generateMetadata`
// diretamente (restrição do Next.js); um layout de segmento server-side é
// o jeito idiomático de aplicar metadata só a esta rota, sem afetar outras.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SucessoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
