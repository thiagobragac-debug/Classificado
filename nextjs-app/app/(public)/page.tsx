import HomeClient from './HomeClient';
import { getServerAds, getServerPlatformStats, getServerTopSellers, getServerTestimonials } from '@/lib/supabase-server';

export default async function Home() {
  const [featuredData, recentData, stats, topSellers, testimonials] = await Promise.all([
    getServerAds({ featured: true, limit: 12 }),
    getServerAds({ limit: 12 }),
    getServerPlatformStats(),
    getServerTopSellers(),
    getServerTestimonials()
  ]);

  return (
    <HomeClient
      initialFeatured={featuredData.ads}
      initialRecent={recentData.ads}
      initialHasMore={recentData.hasMore}
      stats={stats}
      topSellers={topSellers}
      testimonials={testimonials}
    />
  );
}
