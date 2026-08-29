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
          onToggleFav={() => toggleFav(ad.id)}
          priority={index === 0}
        />
      ))}
    </div>
  );
}
