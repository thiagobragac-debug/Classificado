import { Metadata } from 'next';
import AdsBrowser from '@/components/ads/AdsBrowser';
import { getGeoParams, getAllCategories } from '@/lib/listagem-utils';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { logError } from '@/lib/monitoring';
import { t as _t } from '@/lib/constants';
import { escapeJsonLd } from '@/lib/json-ld';
import { imageUrl } from '@/lib/storage';
import { getLocale } from '@/lib/locale-server';
import { localizedPath, buildHreflangAlternates, SITE_URL } from '@/lib/locale';

// Imagem genérica do site pra OG/Twitter/JSON-LD quando não há categoria ou
// foto específica — mesmo asset (existente de fato em public/assets) usado
// como FALLBACK_IMG em app/(public)/anuncio/[id]/page.tsx. leiloes/page.tsx e
// eventos/page.tsx já foram corrigidos numa rodada anterior de auditoria e
// usam o MESMO fallback (hero_farm.webp) — o og:image quebrado que
// referenciava '/assets/og-home.jpg' (arquivo que nunca existiu em
// public/assets) não existe mais em nenhuma página do site (conferido nesta
// auditoria).
const FALLBACK_IMG_ABSOLUTE = `${SITE_URL}/assets/hero_farm.webp`;

function absoluteImageUrl(path?: string | null): string {
  const url = imageUrl(path);
  return url.startsWith('http') ? url : `${SITE_URL}${url}`;
}

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

  const lang = await getLocale();
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

  const title = `${baseTitle}${location}`;
  const description = T.description(baseTitle);

  // BUG CORRIGIDO (auditoria de SEO + achado da verificação adversarial
  // desta rodada): a 1ª versão deste fix só considerava ?categoria= —
  // mas pais/estado/cidade (linhas 58-60 acima) TAMBÉM mudam o title (ex.:
  // "Anúncios em São Paulo"), e continuavam gerando um canonical apontando
  // pra /listagem genérico, reproduzindo o mesmo tipo de divergência
  // título/canonical que esta correção existe pra resolver. Inclui na
  // querystring canônica TODOS os parâmetros explícitos da URL que afetam
  // title/description (categoria + geo) — nunca o valor de geoContext
  // (que pode vir do cookie de geolocalização automática do visitante,
  // sem sinal nenhum na URL; um crawler sem esse cookie nunca vê essa
  // variação, então ela não pertence ao canonical). Os demais parâmetros
  // (busca/ordem/página/etc.) não geram title/description distintos e por
  // isso continuam fora daqui, caindo no canonical mais genérico aplicável.
  // BUG CORRIGIDO (teste de estresse final, 2026-09-02): quando o único
  // filtro que afeta title/description é `categoria` (sem geo junto),
  // /listagem?categoria=X e /categoria/X mostram o mesmo conjunto de
  // anúncios com título quase idêntico, cada um se autodeclarando seu
  // próprio canonical — conteúdo duplicado real pro Google (confirmado ao
  // vivo). /categoria/[slug] é a landing pública pensada pra ser indexada
  // (breadcrumb, JSON-LD dedicado); /listagem é a busca/filtro genérica.
  // categories.id já É o slug usado em /categoria/[slug] (mesmo valor, sem
  // tradução necessária), então só nesse caso simples (categoria sozinha,
  // sem pais/estado/cidade) o canonical aponta pra lá em vez de si mesmo.
  const soCategoriaSemGeo = !!parsedParams.categoria && !parsedParams.pais && !parsedParams.estado && !parsedParams.cidade;
  const canonicalParams = new URLSearchParams();
  if (!soCategoriaSemGeo) {
    if (parsedParams.categoria) canonicalParams.set('categoria', parsedParams.categoria);
    if (parsedParams.pais) canonicalParams.set('pais', parsedParams.pais);
    if (parsedParams.estado) canonicalParams.set('estado', parsedParams.estado);
    if (parsedParams.cidade) canonicalParams.set('cidade', parsedParams.cidade);
  }
  const canonicalQuery = canonicalParams.toString();
  const path = soCategoriaSemGeo
    ? `/categoria/${parsedParams.categoria}`
    : `/listagem${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  const canonicalUrl = `${SITE_URL}${localizedPath(path, lang)}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildHreflangAlternates(SITE_URL, path),
    },
    // BUG CORRIGIDO (auditoria de SEO): página sem openGraph/twitter nenhum
    // — link compartilhado no WhatsApp/Facebook/Twitter caía no fallback
    // genérico do Next (ou nada), diferente de outras páginas de listagem
    // do site (leiloes/page.tsx, eventos/page.tsx). Reaproveita o mesmo
    // title/description já calculados acima; imagem usa o fallback
    // genérico do site (ver FALLBACK_IMG_ABSOLUTE) já que a listagem não
    // tem uma foto única representativa como uma página de anúncio.
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      alternateLocale: lang === 'es' ? 'pt_BR' : 'es_AR',
      images: [{ url: FALLBACK_IMG_ABSOLUTE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [FALLBACK_IMG_ABSOLUTE],
    },
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

// BUG CORRIGIDO (auditoria de SEO): a página não tinha JSON-LD nenhum —
// diferente de leiloes/page.tsx e anuncio/[id]/page.tsx, que já expõem seus
// itens/produto como dado estruturado. Monta um ItemList com os anúncios da
// PÁGINA ATUAL (a mesma leva de `ads` já buscada acima pro grid — não refaz
// a busca nem muda paginação/filtro nenhum). Mesmo padrão de
// escapeJsonLd()/<script type="application/ld+json"> já usado nas outras
// páginas do projeto (agora centralizado em lib/json-ld.ts, como em
// eventos/page.tsx) para manter a mesma sanitização contra fechamento
// prematuro da tag <script>.
function buildItemListJsonLd(ads: any[], lang: 'pt' | 'es') {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: ads.map((ad: any, index: number) => {
      const adTitle = lang === 'es' ? (ad.title_es || ad.title_pt) : ad.title_pt;
      const adUrl = `${SITE_URL}${localizedPath(`/anuncio/${ad.slug}`, lang)}`;
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: adUrl,
        item: {
          '@type': 'Product',
          name: adTitle,
          url: adUrl,
          // Array vazio (ad.images sem fotos) é truthy em JS — mesmo cuidado
          // já documentado em anuncio/[id]/page.tsx: sempre resolve pro
          // fallback explicitamente, nunca deixa `image: []`.
          image: [
            Array.isArray(ad.images) && ad.images.length > 0
              ? absoluteImageUrl(ad.images[0])
              : FALLBACK_IMG_ABSOLUTE,
          ],
          // "Sob consulta" (ad.price null/undefined) não gera bloco `offers`
          // — mesma regra de anuncio/[id]/page.tsx, pra não inventar preço
          // zero/inexistente no dado estruturado.
          ...(ad.price ? {
            offers: {
              '@type': 'Offer',
              url: adUrl,
              priceCurrency: ad.currency || 'BRL',
              price: ad.price,
              availability: 'https://schema.org/InStock',
            },
          } : {}),
        },
      };
    }),
  };
}

async function AdsBrowserWrapper({ parsedParams, geoContext, lang }: { parsedParams: any, geoContext: any, lang: 'pt' | 'es' }) {
  const [
    { ads, total, nextCursor },
    categories
  ] = await Promise.all([
    getAdsListagem(parsedParams, geoContext),
    getAllCategories()
  ]);

  const itemListJsonLd = buildItemListJsonLd(ads, lang);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(itemListJsonLd) }}
      />
      <AdsBrowser
        initialAds={ads}
        initialTotal={total}
        initialGeo={!geoContext.hasManualGeo && geoContext.geoCookie ? geoContext.geoCookie : undefined}
        nextCursor={nextCursor}
        categories={categories}
      />
    </>
  );
}

export default async function ListagemPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const rawParams = await Promise.resolve(searchParams);
  const parsedParams = adsSearchParamsSchema.parse(rawParams);
  const lang = await getLocale();

  const geoContext = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  try {
    return (
      <Suspense fallback={<ListagemSkeleton lang={lang} />}>
        <AdsBrowserWrapper parsedParams={parsedParams} geoContext={geoContext} lang={lang} />
      </Suspense>
    );
  } catch (error) {
    logError(error, { route: 'ListagemPage', params: parsedParams });
    throw new Error('Não foi possível carregar os anúncios neste momento. Tente novamente mais tarde.');
  }
}
