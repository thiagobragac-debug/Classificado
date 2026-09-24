'use client';

import { Ad, Category } from '@/components/ads/AdCard';
import AdCard from '@/components/ads/AdCard';
import { useLang } from '@/lib/lang-context';
import { useFavorites } from '@/lib/useFavorites';

export default function AdsGrid({
  ads,
  categories,
}: {
  ads: Ad[];
  categories: Category[];
}) {
  const { lang } = useLang();
  const { favs, toggleFav } = useFavorites();

  return (
    <div className="ads-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-4)' }}>
      {ads.map((ad, index) => (
        <AdCard
          key={ad.id}
          ad={ad}
          categories={categories}
          lang={lang as 'pt' | 'es'}
          isFav={!!favs[ad.id]}
          // BUG CORRIGIDO (achado ao vivo, varredura de segurança/
          // performance/RLS, 2026-09-24): `() => toggleFav(ad.id)` criava
          // uma closure nova a cada render, o que quebraria qualquer
          // React.memo em AdCard mesmo que existisse. toggleFav já recebe
          // o id como parâmetro (useCallback estável em useFavorites.ts) e
          // AdCard já chama onToggleFav(ad.id) internamente — passar a
          // função direto elimina a closure sem mudar nenhum comportamento.
          onToggleFav={toggleFav}
          priority={index === 0}
        />
      ))}
    </div>
  );
}
