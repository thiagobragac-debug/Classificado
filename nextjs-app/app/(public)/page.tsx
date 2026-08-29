import { Suspense } from 'react';
import type { Metadata } from 'next';
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
import { escapeJsonLd } from '@/lib/json-ld';

// Descrição-base por idioma (mesmo texto do fallback em app/(public)/layout.tsx)
// enriquecida com a região do visitante quando os headers de geolocalização
// da Vercel estão disponíveis — mesma fonte (x-vercel-ip-*) já lida em Home().
const HOME_METADATA_I18N = {
  pt: {
    description: 'O maior portal de classificados do agronegócio do Mercosul. Compre e venda animais, insumos, máquinas e imóveis rurais no Brasil, Argentina, Paraguai e Uruguai.',
    withLocation: (loc: string) => ` Veja anúncios perto de você em ${loc}.`,
  },
  es: {
    description: 'El mayor portal de clasificados del agronegocio del Mercosur. Compra y vende animales, insumos, maquinaria e inmuebles rurales en Brasil, Argentina, Paraguay y Uruguay.',
    withLocation: (loc: string) => ` Mira anuncios cerca de ti en ${loc}.`,
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  // Mesmos headers de geolocalização já lidos em Home() — reaproveitados
  // aqui só para enriquecer a description, sem mexer no title (que continua
  // herdando o title.template definido em app/(public)/layout.tsx).
  const headersList = await headers();
  const city = headersList.get('x-vercel-ip-city') || undefined;
  const state = headersList.get('x-vercel-ip-country-region') || undefined;
  const country = headersList.get('x-vercel-ip-country') || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt') as 'pt' | 'es';
  const m = HOME_METADATA_I18N[lang];

  const location = [city, state, country].filter(Boolean).join(', ');
  const description = location ? `${m.description}${m.withLocation(location)}` : m.description;

  return { description };
}

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

  // Mesmo padrão i18n do restante do arquivo (lang já lido acima) — nomes de
  // categoria alinhados com lib/constants.ts (CATEGORIES / FOOTER_LINKS).
  const JSONLD_I18N = {
    pt: {
      websiteDescription: 'O maior portal de classificados do agronegócio do Mercosul.',
      featuredCategories: 'Categorias em Destaque',
      bovinos: 'Bovinos',
      maquinas: 'Máquinas',
      imoveis: 'Imóveis',
    },
    es: {
      websiteDescription: 'El mayor portal de clasificados del agronegocio del Mercosur.',
      featuredCategories: 'Categorías Destacadas',
      bovinos: 'Bovinos',
      maquinas: 'Maquinaria',
      imoveis: 'Inmuebles',
    },
  } as const;
  const jl = JSONLD_I18N[lang];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Tauze Class",
        "url": siteUrl,
        "description": jl.websiteDescription,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${siteUrl}/listagem?busca={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      // BUG CORRIGIDO (auditoria de SEO, 2ª rodada — cobertura de dados
      // estruturados): a home já tinha WebSite/ItemList, mas nenhum
      // Organization — o Google usa esse tipo pra entender QUEM opera o
      // site (aparece no painel de conhecimento, ajuda a desambiguar a
      // marca em buscas pelo nome). Sem `logo` e `sameAs` de propósito:
      // não existe arquivo de logo em public/ nem link social real (o
      // rodapé usa href="#" pros ícones de Instagram/Facebook/WhatsApp —
      // ver Footer.tsx) — inventar esses valores seria dado estruturado
      // falso. Adicionar os dois assim que existirem de verdade.
      {
        "@type": "Organization",
        "name": "Tauze Class",
        "url": siteUrl,
        "description": jl.websiteDescription,
      },
      {
        "@type": "ItemList",
        "name": jl.featuredCategories,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": jl.bovinos, "url": `${siteUrl}/categoria/cat-bovinos` },
          { "@type": "ListItem", "position": 2, "name": jl.maquinas, "url": `${siteUrl}/categoria/cat-maquinas` },
          { "@type": "ListItem", "position": 3, "name": jl.imoveis, "url": `${siteUrl}/categoria/cat-imoveis` }
        ]
      }
    ]
  };

  const safeJsonLd = escapeJsonLd(jsonLd);

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
