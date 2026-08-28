import { Suspense } from 'react';
import { getServerAds, getServerPlatformStats, getServerTopSellers, getServerTestimonials, getServerUpcomingEvents } from '@/lib/supabase-server';

import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedAdsSection } from '@/components/home/FeaturedAdsSection';
import { TrustSection } from '@/components/home/TrustSection';
import { TopSellersSection } from '@/components/home/TopSellersSection';
import { MercosulSection } from '@/components/home/MercosulSection';
import { RecentAdsSection } from '@/components/home/RecentAdsSection';
import { CtaSection } from '@/components/home/CtaSection';
import { EventsAuctionsSection } from '@/components/home/EventsAuctionsSection';
import { AdBanner } from '@/components/AdBanner';
import dynamic from 'next/dynamic';
import { headers, cookies } from 'next/headers';
import { t } from '@/lib/constants';

// Nota: A página agora é dinâmica automaticamente (pois usamos headers() no código)
// Não podemos exportar 'dynamic' aqui pois dá conflito de nome com a importação 'next/dynamic'

function SectionSkeleton() {
  return (
    <div className="container skeleton-section-container">
       <div className="skeleton-section-card" aria-hidden="true"></div>
    </div>
  );
}

const TestimonialsSection = dynamic(
  () => import('@/components/home/TestimonialsSection').then((mod) => mod.TestimonialsSection),
  { ssr: true, loading: () => <SectionSkeleton /> }
);

// Funções de Wrapper para Suspense e Streaming
// Wrapper genérico — recebe dados já prontos
async function HeroWrapper() {
  const stats = await getServerPlatformStats();
  return <HeroSection stats={stats} />;
}

async function FeaturedAdsWrapper({ city, state, country }: { city?: string; state?: string; country?: string }) {
  const { getServerFeaturedAds } = await import('@/lib/supabase-server');
  const featuredAds = await getServerFeaturedAds(city, state, country, 4);
  return <FeaturedAdsSection featuredAds={featuredAds} />;
}

async function TopSellersWrapper({ city, state, country }: { city?: string; state?: string; country?: string }) {
  const { getServerTopSellers } = await import('@/lib/supabase-server');
  const topSellers = await getServerTopSellers(city, state, country, 4);
  return <TopSellersSection topSellers={topSellers} />;
}

async function TestimonialsWrapper() {
  const testimonials = await getServerTestimonials();
  return <TestimonialsSection testimonials={testimonials} />;
}

async function RecentAdsWrapper({ city, state, country }: { city?: string; state?: string; country?: string }) {
  const { getServerRecentAds } = await import('@/lib/supabase-server');
  const recentData = await getServerRecentAds(city, state, country, 10);
  return (
    <RecentAdsSection 
      initialRecent={recentData.ads} 
      initialHasMore={recentData.hasMore} 
      city={city} 
      state={state} 
      country={country} 
    />
  );
}

async function EventsAuctionsWrapper({ city, state, country, lang }: { city?: string; state?: string; country?: string; lang: 'pt' | 'es' }) {
  const { getServerUpcomingEvents } = await import('@/lib/supabase-server');
  const upcomingEvents = await getServerUpcomingEvents(city, state, country, 3, lang);
  return <EventsAuctionsSection events={upcomingEvents} />;
}

function HeroSkeleton({ lang }: { lang: 'pt' | 'es' }) {
  return (
    <section className="hero skeleton-hero-wrapper" aria-busy="true" role="status" aria-label={t('hero_loading', lang)}>
      <div className="container">
        <div className="hero-grid">
          <div className="hero-left skeleton-hero-left" aria-hidden="true">
            <div className="skeleton-hero-title"></div>
            <div className="skeleton-hero-subtitle"></div>
            <div className="skeleton-hero-button"></div>
          </div>
          <div className="hero-right" aria-hidden="true">
            <div className="skeleton-hero-right"></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// SectionSkeleton foi movido para o topo do arquivo

export default async function Home() {
  // Lê os headers geo UMA VEZ para todos os wrappers
  const headersList = await headers();
  const city    = headersList.get('x-vercel-ip-city')           || undefined;
  const state   = headersList.get('x-vercel-ip-country-region') || undefined;
  const country = headersList.get('x-vercel-ip-country')        || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt') as 'pt' | 'es';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tauzeclass.com.br";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Tauze Class",
        "url": siteUrl,
        "description": "O maior portal de classificados do agronegócio do Mercosul.",
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${siteUrl}/listagem?busca={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "ItemList",
        "name": "Categorias em Destaque",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Bovinos", "url": `${siteUrl}/listagem?categoria=bovinos` },
          { "@type": "ListItem", "position": 2, "name": "Máquinas", "url": `${siteUrl}/listagem?categoria=maquinas` },
          { "@type": "ListItem", "position": 3, "name": "Imóveis", "url": `${siteUrl}/listagem?categoria=imoveis` }
        ]
      }
    ]
  };

  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
      <Suspense fallback={<HeroSkeleton lang={lang} />}>
        <HeroWrapper />
      </Suspense>
      
      <div className="container" style={{ minHeight: '120px' }}><AdBanner position="home_top" /></div>
      
      <CategoriesSection />
      
      <Suspense fallback={<SectionSkeleton />}>
        <FeaturedAdsWrapper city={city} state={state} country={country} />
      </Suspense>
      
      <TrustSection />
      
      <Suspense fallback={<SectionSkeleton />}>
        <TopSellersWrapper city={city} state={state} country={country} />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton />}>
        <TestimonialsWrapper />
      </Suspense>
      
      <MercosulSection />
      
      <div className="container" style={{ minHeight: '120px' }}><AdBanner position="home_mid" /></div>
      
      <Suspense fallback={<SectionSkeleton />}>
        <RecentAdsWrapper city={city} state={state} country={country} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <EventsAuctionsWrapper city={city} state={state} country={country} lang={lang} />
      </Suspense>

      <CtaSection />
    </>
  );
}
