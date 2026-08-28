import { Metadata } from 'next';
import { cookies } from 'next/headers';
import AdsBrowser from '@/components/ads/AdsBrowser';
import { getGeoParams, getAllCategories } from '@/lib/listagem-utils';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { logError } from '@/lib/monitoring';
import { t as _t } from '@/lib/constants';

const METADATA_TRANSLATIONS = {
  pt: {
    defaultTitle: 'Anúncios',
    locationSuffix: (place: string) => ` em ${place}`,
    description: (title: string) => `Encontre os melhores ${title.toLowerCase()} na Tauze Class. O maior classificado premium agro.`,
  },
  es: {
    defaultTitle: 'Anuncios',
    locationSuffix: (place: string) => ` en ${place}`,
    description: (title: string) => `Encuentra los mejores ${title.toLowerCase()} en Tauze Class. El clasificado premium agro más grande.`,
  }
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<Metadata> {
  const rawParams = await Promise.resolve(searchParams);
  const parsedParams = adsSearchParamsSchema.parse(rawParams);

  const lang = (await cookies()).get('tc_lang')?.value === 'es' ? 'es' : 'pt';
  const T = METADATA_TRANSLATIONS[lang];

  let baseTitle = T.defaultTitle;
  let location = '';

  const { pais, estado, cidade } = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  if (cidade) location = T.locationSuffix(cidade);
  else if (estado) location = T.locationSuffix(estado);
  else if (pais) location = T.locationSuffix(pais);

  if (parsedParams.categoria) {
    // getAllCategories() já traz name_pt/name_es e é memoizada por request
    // (React cache) — reaproveita a mesma chamada feita por AdsBrowserWrapper
    // abaixo, sem precisar tocar em getCategoryName (fora do escopo deste
    // agente, só devolve name_pt).
    const allCategories = await getAllCategories();
    const category = allCategories.find((c: any) => c.id === parsedParams.categoria);
    const categoryName = category ? (lang === 'es' ? category.name_es : category.name_pt) : null;
    if (categoryName) baseTitle = categoryName;
  }

  return {
    title: `${baseTitle}${location}`,
    description: T.description(baseTitle),
    alternates: {
      canonical: `https://tauzeclass.com.br/listagem`,
    }
  };
}

import { Suspense } from 'react';

// BUG CORRIGIDO (auditoria de cobertura de i18n em todas as páginas de
// cliente, retomada da validação "sem exceção"): aria-label do skeleton
// (fallback do Suspense) nunca lia o idioma - mesmo padrao ja usado em
// generateMetadata() acima (leitura de cookies()).
function ListagemSkeleton({ lang }: { lang: 'pt' | 'es' }) {
  return (
    <div className="container skeleton-listagem-container" aria-busy="true" role="status" aria-label={_t('listagem_skeleton_aria', lang)}>
      <div className="skeleton-listagem-header" aria-hidden="true"></div>
      <div className="skeleton-listagem-grid-outer">
        <div className="skeleton-listagem-grid-inner">
           {[...Array(6)].map((_, i) => (
             <div key={i} className="skeleton-listagem-card" aria-hidden="true"></div>
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
  const lang = (await cookies()).get('tc_lang')?.value === 'es' ? 'es' : 'pt';

  const geoContext = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  try {
    return (
      <Suspense fallback={<ListagemSkeleton lang={lang} />}>
        <AdsBrowserWrapper parsedParams={parsedParams} geoContext={geoContext} />
      </Suspense>
    );
  } catch (error) {
    logError(error, { route: 'ListagemPage', params: parsedParams });
    throw new Error('Não foi possível carregar os anúncios neste momento. Tente novamente mais tarde.');
  }
}
