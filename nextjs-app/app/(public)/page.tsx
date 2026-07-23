import { Suspense } from 'react';
import { getServerAds, getServerPlatformStats, getServerTopSellers, getServerTestimonials } from '@/lib/supabase-server';

import { HeroSection } from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedAdsSection } from '@/components/home/FeaturedAdsSection';
import { TrustSection } from '@/components/home/TrustSection';
import { TopSellersSection } from '@/components/home/TopSellersSection';
import { MercosulSection } from '@/components/home/MercosulSection';
import { RecentAdsSection } from '@/components/home/RecentAdsSection';
import { CtaSection } from '@/components/home/CtaSection';
import { AdBanner } from '@/components/AdBanner';
import dynamic from 'next/dynamic';

const TestimonialsSection = dynamic(
  () => import('@/components/home/TestimonialsSection').then((mod) => mod.TestimonialsSection),
  { ssr: true }
);

// Funções de Wrapper para Suspense e Streaming
async function FeaturedAdsWrapper() {
  const featuredData = await getServerAds({ featured: true, limit: 12 });
  return <FeaturedAdsSection featuredAds={featuredData.ads} />;
}

async function TopSellersWrapper() {
  const topSellers = await getServerTopSellers();
  return <TopSellersSection topSellers={topSellers} />;
}

async function TestimonialsWrapper() {
  const testimonials = await getServerTestimonials();
  return <TestimonialsSection testimonials={testimonials} />;
}

async function RecentAdsWrapper() {
  const recentData = await getServerAds({ limit: 12 });
  return <RecentAdsSection initialRecent={recentData.ads} initialHasMore={recentData.hasMore} />;
}

async function HeroWrapper() {
  const stats = await getServerPlatformStats();
  return <HeroSection stats={stats} />;
}

function HeroSkeleton() {
  return (
    <section className="hero animate-pulse" aria-busy="true" role="status" aria-label="Carregando portal...">
      <div className="container">
        <div className="hero-grid">
          <div className="hero-left flex flex-col gap-6">
            <div className="bg-gray-200 dark:bg-gray-800 rounded-lg w-4/5 h-16"></div>
            <div className="bg-gray-200 dark:bg-gray-800 rounded-md w-3/5 h-6"></div>
            <div className="bg-gray-200 dark:bg-gray-800 rounded-full w-full h-14 mt-4"></div>
          </div>
          <div className="hero-right">
            <div className="bg-gray-200 dark:bg-gray-800 rounded-3xl w-full h-full min-h-[400px]"></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Skeleton para transições suaves
function SectionSkeleton() {
  return (
    <div className="container py-16 animate-pulse" aria-busy="true" role="status" aria-label="Carregando seção...">
       <div className="bg-gray-200 dark:bg-gray-800 rounded-2xl w-full aspect-[21/9] min-h-[300px]"></div>
    </div>
  );
}

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Tauze Class",
        "url": "https://tauzeclass.com.br",
        "description": "O maior portal de classificados do agronegócio do Mercosul.",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://tauzeclass.com.br/listagem?busca={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "ItemList",
        "name": "Categorias em Destaque",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Bovinos", "url": "https://tauzeclass.com.br/listagem?categoria=bovinos" },
          { "@type": "ListItem", "position": 2, "name": "Máquinas", "url": "https://tauzeclass.com.br/listagem?categoria=maquinas" },
          { "@type": "ListItem", "position": 3, "name": "Imóveis", "url": "https://tauzeclass.com.br/listagem?categoria=imoveis" }
        ]
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={<HeroSkeleton />}>
        <HeroWrapper />
      </Suspense>
      
      <div className="container"><AdBanner position="home_top" /></div>
      
      <CategoriesSection />
      
      <Suspense fallback={<SectionSkeleton />}>
        <FeaturedAdsWrapper />
      </Suspense>
      
      <TrustSection />
      
      <Suspense fallback={<SectionSkeleton />}>
        <TopSellersWrapper />
      </Suspense>
      
      <Suspense fallback={<SectionSkeleton />}>
        <TestimonialsWrapper />
      </Suspense>
      
      <MercosulSection />
      
      <div className="container"><AdBanner position="home_mid" /></div>
      
      <Suspense fallback={<SectionSkeleton />}>
        <RecentAdsWrapper />
      </Suspense>

      <CtaSection />
    </>
  );
}
