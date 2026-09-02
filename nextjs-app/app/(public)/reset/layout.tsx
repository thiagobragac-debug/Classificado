import type { Metadata } from 'next';

// Página utilitária (só limpa cache local e redireciona) — não deve ser indexada.
// page.tsx é 'use client' e por isso não pode exportar metadata/generateMetadata
// diretamente (restrição do Next.js); um layout de segmento server-side é o jeito
// idiomático de aplicar metadata só a esta rota, sem afetar outras. Mesmo padrão
// já usado em app/(public)/sucesso/layout.tsx e app/(public)/cancelado/layout.tsx.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
