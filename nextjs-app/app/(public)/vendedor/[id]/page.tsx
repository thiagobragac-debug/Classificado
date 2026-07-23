import { cache, Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import AdsBrowser from '@/components/ads/AdsBrowser';
import SellerProfileHeader from '@/components/seller/SellerProfileHeader';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { getAllCategories, getGeoParams } from '@/lib/listagem-utils';
import { createAnonClient } from '@/lib/supabase-server';

type Props = { 
  params: Promise<{ id: string }> | { id: string }, 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined } 
};

// Next.js React cache dedups this call per request
const getProfile = cache(async (id: string) => {
  const sb = createAnonClient();
  const { data } = await sb.from('profiles').select('name, display_name').eq('id', id).single();
  return data;
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const profile = await getProfile(params.id);
  
  if (!profile) return { title: 'Vendedor não encontrado' };

  const sellerName = profile.display_name || profile.name || 'Vendedor';

  return {
    title: `Produtos de ${sellerName} | Classificados`,
    description: `Confira os anúncios e avaliações de ${sellerName}.`,
    openGraph: {
      title: `${sellerName} - Classificados`,
      description: `Veja os produtos de ${sellerName}.`,
    }
  };
}

export default async function VendedorPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const geoContext = await getGeoParams({});
  const sp = { ...searchParams, seller_id: params.id };
  const parsedParams = adsSearchParamsSchema.parse(sp);
  
  const sb = createAnonClient();

  // Profile is now deduplicated, it will instantly return from cache if generateMetadata already ran
  const profile = await getProfile(params.id);

  if (!profile) {
    notFound();
  }

  const sellerName = profile.display_name || profile.name || 'Vendedor Anônimo';

  return (
    <main className="flex-1 flex flex-col" style={{ marginTop: 'var(--header-h)' }}>
      <div className="list-hero" style={{ paddingBottom: '80px' }}>
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <a href="/">Início</a>
                <span aria-hidden="true">›</span>
                <span>Vendedores</span>
              </nav>
              <h1 className="list-hero-title">
                Produtos de {sellerName}
              </h1>
              <p className="list-hero-count" style={{ opacity: 0.9, marginTop: '4px' }}>
                Confira todos os anúncios e reputação deste vendedor
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <Suspense fallback={
        <div className="container" style={{ marginTop: '-80px', position: 'relative', zIndex: 10 }}>
           <div style={{ height: '200px', background: 'var(--clr-surface)', borderRadius: '1rem', border: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    { data: statsData }
  ] = await Promise.all([
    getAdsListagem(parsedParams, geoContext),
    getAllCategories(),
    sb.rpc('get_seller_stats', { p_seller_id: sellerId })
  ]);

  const stats = statsData && statsData.length > 0 ? statsData[0] : { total_reviews: 0, avg_rating: 0 };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateCreated: new Date().toISOString(),
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ marginTop: '-80px', position: 'relative', zIndex: 10 }}>
        <SellerProfileHeader sellerId={sellerId} sellerName={sellerName} stats={stats} />
      </div>
      <AdsBrowser 
        initialAds={ads}
        initialTotal={total}
        categories={categories}
        nextCursor={nextCursor}
        sellerId={sellerId} 
        hideHero 
      />
    </>
  );
}
