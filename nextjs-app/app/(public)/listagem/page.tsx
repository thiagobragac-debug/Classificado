import { Metadata } from 'next';
import AdsBrowser from '@/components/ads/AdsBrowser';
import { getGeoParams, getCategoryName, getAllCategories } from '@/lib/listagem-utils';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { logError } from '@/lib/monitoring';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<Metadata> {
  const rawParams = await Promise.resolve(searchParams);
  const parsedParams = adsSearchParamsSchema.parse(rawParams);
  
  let baseTitle = 'Anúncios';
  let location = '';

  const { pais, estado, cidade } = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  if (cidade) location = ` em ${cidade}`;
  else if (estado) location = ` em ${estado}`;
  else if (pais) location = ` em ${pais}`;

  if (parsedParams.categoria) {
    const categoryName = await getCategoryName(parsedParams.categoria);
    if (categoryName) baseTitle = categoryName;
  }

  return {
    title: `${baseTitle}${location} | Tauze Class`,
    description: `Encontre os melhores ${baseTitle.toLowerCase()} na Tauze Class. O maior classificado premium agro.`,
  };
}

import { Suspense } from 'react';

function ListagemSkeleton() {
  return (
    <div className="container" style={{ padding: '4rem 0' }}>
      <div className="skeleton" style={{ width: '100%', height: '150px', borderRadius: 16, marginBottom: '2rem' }}></div>
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        <div className="skeleton" style={{ width: '100%', height: '400px', borderRadius: 16 }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
           {[...Array(6)].map((_, i) => (
             <div key={i} className="skeleton" style={{ width: '100%', height: '320px', borderRadius: 16 }}></div>
           ))}
        </div>
      </div>
    </div>
  );
}

async function AdsBrowserWrapper({ parsedParams, geoContext }: { parsedParams: any, geoContext: any }) {
  const [
    { ads, total, nextCursor },
    categories
  ] = await Promise.all([
    getAdsListagem(parsedParams, geoContext),
    getAllCategories()
  ]);
  
  return (
    <AdsBrowser 
      initialAds={ads} 
      initialTotal={total} 
      initialGeo={!geoContext.hasManualGeo && geoContext.geoCookie ? geoContext.geoCookie : undefined}
      nextCursor={nextCursor}
      categories={categories}
    />
  );
}

export default async function ListagemPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const rawParams = await Promise.resolve(searchParams);
  const parsedParams = adsSearchParamsSchema.parse(rawParams);
  
  const geoContext = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  try {
    return (
      <Suspense fallback={<ListagemSkeleton />}>
        <AdsBrowserWrapper parsedParams={parsedParams} geoContext={geoContext} />
      </Suspense>
    );
  } catch (error) {
    logError(error, { route: 'ListagemPage', params: parsedParams });
    throw new Error('Não foi possível carregar os anúncios neste momento. Tente novamente mais tarde.');
  }
}
