'use client';

import { Suspense } from 'react';
import AdsBrowser from '@/components/ads/AdsBrowser';

export default function ListagemPage() {
  return (
    <Suspense fallback={
      <main style={{ marginTop: 'var(--header-h)', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="list-hero">
          <div className="container">
            <div className="list-hero-inner">
              <div>
                <h1 className="list-hero-title">Anúncios</h1>
                <p className="list-hero-count">Carregando…</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    }>
      <AdsBrowser />
    </Suspense>
  );
}
