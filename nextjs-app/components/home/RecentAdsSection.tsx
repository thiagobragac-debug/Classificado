'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/lang-context';
import { useFavorites } from '@/lib/useFavorites';
import { useRecentViews } from '@/lib/useRecentViews';
import { getAds } from '@/lib/supabase';
import { AdCardHome } from './AdCardHome';

export function RecentAdsSection({ initialRecent, initialHasMore }: { initialRecent: any[], initialHasMore: boolean }) {
  const { lang, t } = useLang();
  const { favs, toggleFav } = useFavorites();
  const { recentViews } = useRecentViews();

  const [recentAds, setRecentAds] = useState<any[]>(initialRecent || []);
  const [recentPage, setRecentPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMoreRecent = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = recentPage + 1;
      const { ads, hasMore: more } = await getAds({ limit: 12, page: next });
      setRecentAds(prev => [...prev, ...ads]);
      setHasMore(more ?? false);
      setRecentPage(next);
    } finally {
      setLoadingMore(false);
    }
  }, [recentPage, loadingMore]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        loadMoreRecent();
      }
    }, { threshold: 0.1 });
    if (loadMoreRef.current) obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loadMoreRecent]);

  // UseMemo instead of sorting on every render
  const sortedRecentAds = useMemo(() => {
    return [...recentAds].sort((a, b) => {
      const favoriteCategory = recentViews[0]?.category_id;
      if (!favoriteCategory) return 0;
      const aMatch = a.category_id === favoriteCategory ? 1 : 0;
      const bMatch = b.category_id === favoriteCategory ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [recentAds, recentViews]);

  return (
    <>
      {recentViews.length > 0 && (
        <section className="section" style={{ paddingBottom: 0 }} aria-labelledby="recently-viewed-heading">
          <div className="container">
            <h2 className="section-title" id="recently-viewed-heading" style={{ marginBottom: '1.5rem' }}>
              {t('recently_viewed') || 'Vistos Recentemente'}
            </h2>
            <div className="ads-grid" style={{ marginBottom: '2.5rem' }}>
              {recentViews.map((ad: any) => (
                <AdCardHome key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ background: 'var(--clr-bg-alt)' }} aria-labelledby="recent-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-label">{recentViews.length > 0 ? (lang === 'es' ? 'Para ti' : 'Para Você') : t('section_recent')}</div>
              <h2 className="section-title" id="recent-heading">
                {recentViews.length > 0 ? (lang === 'es' ? 'Recomendados para ti' : 'Recomendados para Você') : t('section_recent_title')}
              </h2>
            </div>
            <Link href="/listagem" className="view-all">
              <span>{t('view_all')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
          <div className="ads-grid" id="recent-ads" role="list" aria-label="Últimos anúncios publicados">
            {recentAds.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: 'white', borderRadius: 16, border: '1px dashed var(--clr-border)' }}>
                <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1rem' }}>Nenhum anúncio recente encontrado.</p>
                <Link href="/login?mode=register" className="btn btn--primary">Seja o primeiro a anunciar!</Link>
              </div>
            ) : (
              <>
                {sortedRecentAds.map(ad => (
                  <AdCardHome key={ad.id} ad={ad} lang={lang} favs={favs} toggleFav={toggleFav} />
                ))}
                {loadingMore && Array.from({ length: 4 }).map((_, i) => (
                  <div key={`skel-${i}`} className="skeleton" style={{ height: 320, width: '100%', border: '1px solid var(--clr-border)' }}></div>
                ))}
              </>
            )}
          </div>
          {hasMore && (
            <div ref={loadMoreRef} style={{ height: '40px', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {loadingMore && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
