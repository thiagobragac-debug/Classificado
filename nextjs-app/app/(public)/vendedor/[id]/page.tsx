import { cache, Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import AdsBrowser from '@/components/ads/AdsBrowser';
import SellerProfileHeader from '@/components/seller/SellerProfileHeader';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { getAllCategories } from '@/lib/listagem-utils';
import { createAnonClient } from '@/lib/supabase-server';
import { getLocale } from '@/lib/locale-server';
import { localizedPath, buildHreflangAlternates } from '@/lib/locale';
import { t as _t } from '@/lib/constants';

type Props = {
  params: Promise<{ id: string }> | { id: string },
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined }
};

// Next.js React cache dedups this call per request
const getProfile = cache(async (id: string) => {
  const sb = createAnonClient();
  // BUG CORRIGIDO (reteste do site, 2026-08-25): faltava avatar_url/
  // banner_url — o header do vendedor sempre mostrava a inicial genérica
  // e o banner padrão, mesmo quando o vendedor tinha foto real cadastrada.
  const { data } = await sb.from('profiles').select('name, display_name, created_at, verified, avatar_url, banner_url').eq('id', id).single();
  return data;
});

const SITE_URL = 'https://tauzeclass.com.br';
const FALLBACK_OG_IMAGE = `${SITE_URL}/assets/og-home.jpg`;

// BUG CORRIGIDO (auditoria de SEO): og:image usava incondicionalmente a
// imagem genérica do site, ignorando avatar_url/banner_url reais do
// vendedor (já buscados por getProfile() desde o fix de 2026-08-25 —
// ver comentário ali). Prioriza avatar sobre banner (mais parecido com o
// "profile picture" que redes sociais esperam pra og:type=profile).
// Garante URL absoluta mesmo que a coluna um dia guarde caminho relativo —
// hoje avatar_url/banner_url já saem como URL completa (ver uso direto
// como <img src> em SellerProfileHeader.tsx / AdSidebar.tsx, sem prefixo
// de storage bucket, diferente de ads.images).
function toAbsoluteImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  // Mesma fonte de verdade do resto do site — ver lib/locale-server.ts.
  const lang = await getLocale();
  const profile = await getProfile(params.id);

  if (!profile) return { title: lang === 'es' ? 'Vendedor no encontrado' : 'Vendedor não encontrado' };

  const sellerName = profile.display_name || profile.name || 'Vendedor';
  const ogImage = toAbsoluteImageUrl(profile.avatar_url) || toAbsoluteImageUrl(profile.banner_url) || FALLBACK_OG_IMAGE;

  // BUG CRÍTICO CORRIGIDO (migração de SEO): ?lang= dependia da MESMA URL
  // servir dois conteúdos — /es/vendedor/{id} agora é uma URL real e
  // distinta (rewrite em proxy.ts), igual ao resto do site.
  const path = `/vendedor/${params.id}`;
  const canonicalUrl = `${SITE_URL}${localizedPath(path, lang)}`;

  return {
    title: lang === 'es' ? `Productos de ${sellerName}` : `Produtos de ${sellerName}`,
    description: lang === 'es'
      ? `Consulta los anuncios y valoraciones de ${sellerName} en el mayor clasificado agro del Mercosur.`
      : `Confira os anúncios e avaliações de ${sellerName} no maior classificado agro do Mercosul.`,
    alternates: {
      canonical: canonicalUrl,
      languages: buildHreflangAlternates(SITE_URL, path),
    },
    openGraph: {
      title: `${sellerName} — ${lang === 'es' ? 'Clasificados Agro' : 'Classificados Agro'} | Tauze Class`,
      description: lang === 'es'
        ? `Mira los productos de ${sellerName} y consulta su reputación.`
        : `Veja os produtos de ${sellerName} e confira sua reputação.`,
      url: canonicalUrl,
      type: 'profile',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${sellerName} | Tauze Class` }],
    },
    twitter: {
      // BUG CORRIGIDO (auditoria de SEO): card 'summary' sem imagem
      // destoava do resto do site (anuncio/[id]/page.tsx, home) que usa
      // 'summary_large_image' — padronizado, reaproveitando ogImage.
      card: 'summary_large_image',
      title: `${sellerName} — Tauze Class`,
      description: lang === 'es' ? `Consulta los anuncios de ${sellerName}.` : `Confira os anúncios de ${sellerName}.`,
      images: [ogImage],
    },
  };
}

export default async function VendedorPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  // Mesma fonte de verdade de generateMetadata acima.
  const lang = await getLocale();
  const t = (key: string) => _t(key, lang);

  const sp = { ...searchParams, seller_id: params.id };
  const parsedParams = adsSearchParamsSchema.parse(sp);

  // BUG CRÍTICO CORRIGIDO (reteste do site, 2026-08-25): getGeoParams() cai
  // pro cookie de geolocalização automática (IP do visitante) sempre que
  // pais/estado/cidade não vêm explícitos na URL — correto para /listagem
  // (uma busca "perto de você"), mas errado aqui: a página de um vendedor
  // específico não deveria esconder os anúncios dele só porque o VISITANTE
  // está em outra cidade. Confirmado ao vivo: um vendedor com 9 anúncios
  // ativos espalhados pelo Mercosul mostrava "Nenhum anúncio encontrado"
  // pra qualquer visitante fora da cidade autodetectada. Construído aqui
  // sem o fallback de cookie — só filtra por localização se o VISITANTE
  // escolher manualmente um filtro na própria tela do vendedor.
  const geoContext = {
    pais: parsedParams.pais || null,
    estado: parsedParams.estado || null,
    cidade: parsedParams.cidade || null,
    hasManualGeo: !!(parsedParams.pais || parsedParams.estado || parsedParams.cidade),
    geoCookie: null,
  };

  const sb = createAnonClient();

  // Profile is now deduplicated, it will instantly return from cache if generateMetadata already ran
  const profile = await getProfile(params.id);

  if (!profile) {
    notFound();
  }

  const sellerName = profile.display_name || profile.name || (lang === 'es' ? 'Vendedor Anónimo' : 'Vendedor Anônimo');

  return (
    <main className="flex-1 flex flex-col" style={{ marginTop: 'var(--header-h)' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              {/* BUG CORRIGIDO (i18n): aria-label estava fixo em inglês */}
              <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
                <a href="/">{t('nav_home')}</a>
                <span aria-hidden="true">›</span>
                <span>Vendedores</span>
              </nav>
              <h1 className="list-hero-title">
                {lang === 'es' ? `Productos de ${sellerName}` : `Produtos de ${sellerName}`}
              </h1>
              <p className="list-hero-count" style={{ opacity: 0.9, marginTop: '4px' }}>
                {lang === 'es' ? 'Consulta todos los anuncios y la reputación de este vendedor' : 'Confira todos os anúncios e reputação deste vendedor'}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <Suspense fallback={
        <div className="container" style={{ marginTop: '-40px', position: 'relative', zIndex: 10 }}>
           <div style={{ height: '120px', background: 'var(--clr-surface)', borderRadius: '1rem', border: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span className="spinner" />
           </div>
        </div>
      }>
        <SellerContent 
          sellerId={params.id} 
          sellerName={sellerName} 
          parsedParams={parsedParams} 
          geoContext={geoContext} 
        />
      </Suspense>
    </main>
  );
}

async function SellerContent({ sellerId, sellerName, parsedParams, geoContext }: { sellerId: string, sellerName: string, parsedParams: any, geoContext: any }) {
  const sb = createAnonClient();
  const [
    { ads, total, nextCursor },
    categories,
    { data: statsData },
    profile,
  ] = await Promise.all([
    getAdsListagem(parsedParams, geoContext),
    getAllCategories(),
    sb.rpc('get_seller_stats', { p_seller_id: sellerId }),
    getProfile(sellerId), // cached — sem custo extra de rede
  ]);

  const stats = statsData && statsData.length > 0 ? statsData[0] : { total_reviews: 0, avg_rating: 0 };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateCreated: profile?.created_at ?? new Date().toISOString(),
    mainEntity: {
      '@type': 'Person',
      name: sellerName,
      aggregateRating: stats.total_reviews > 0 ? {
        '@type': 'AggregateRating',
        ratingValue: stats.avg_rating,
        reviewCount: stats.total_reviews
      } : undefined
    }
  };

  const safeJsonLd = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd }} />
      <div style={{ marginTop: '-40px', position: 'relative', zIndex: 10 }}>
        <SellerProfileHeader
          sellerId={sellerId}
          sellerName={sellerName}
          stats={{ ...stats, verified: profile?.verified ?? false }}
          sellerCreatedAt={profile?.created_at ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          bannerUrl={profile?.banner_url ?? null}
        />
      </div>
      <AdsBrowser 
        initialAds={ads}
        initialTotal={total}
        initialGeo={geoContext}
        categories={categories}
        nextCursor={nextCursor}
        sellerId={sellerId} 
        hideHero 
      />
    </>
  );
}
