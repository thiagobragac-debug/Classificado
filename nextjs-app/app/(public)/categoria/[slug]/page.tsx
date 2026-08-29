import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import AdsBrowser from '@/components/ads/AdsBrowser';
import { getGeoParams, getAllCategories } from '@/lib/listagem-utils';
import { getAdsListagem, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { logError } from '@/lib/monitoring';
import { t as _t, type Lang } from '@/lib/constants';
import { escapeJsonLd } from '@/lib/json-ld';
import { imageUrl } from '@/lib/storage';

// Página de categoria (/categoria/[slug]) — landing pública, indexável, de
// uma categoria específica. Reaproveita a MESMA lógica de busca/paginação de
// anúncios já usada por app/(public)/listagem/page.tsx (getAdsListagem,
// adsSearchParamsSchema, getGeoParams, getAllCategories, AdsBrowser) — só
// filtrando sempre por uma categoria, resolvida a partir do [slug] da rota.
// categories.id JÁ É o "slug" (texto legível, ex.: "gado-de-corte") — ver
// a geração de id em app/(admin)/admin/categorias/page.tsx (handleSave):
// nome slugificado, sem migração nova necessária.

const SITE_URL = 'https://tauzeclass.com.br';
// Mesmo fallback (mesmo asset, comprovadamente existente em public/assets)
// usado em listagem/page.tsx e anuncio/[id]/page.tsx pro OG/Twitter/JSON-LD
// quando não há foto específica.
const FALLBACK_IMG_ABSOLUTE = `${SITE_URL}/assets/hero_farm.webp`;

function absoluteImageUrl(path?: string | null): string {
  const url = imageUrl(path);
  return url.startsWith('http') ? url : `${SITE_URL}${url}`;
}

const METADATA_TRANSLATIONS: Record<Lang, { description: (name: string) => string; navAriaLabel: string }> = {
  pt: {
    description: (name: string) => `Encontre os melhores anúncios de ${name.toLowerCase()} na Tauze Class. O maior classificado premium agro.`,
    navAriaLabel: 'Navegação',
  },
  es: {
    description: (name: string) => `Encuentra los mejores anuncios de ${name.toLowerCase()} en Tauze Class. El clasificado premium agro más grande.`,
    navAriaLabel: 'Navegación',
  }
};

type Props = {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>;
};

// Resolve a categoria da PÁGINA (pelo slug da rota — decide o notFound()) e a
// categoria EFETIVA a filtrar (pode ser sobrescrita por ?categoria= na
// query). Usado tanto em generateMetadata quanto no corpo da página, sempre
// com o MESMO resultado (getAllCategories() é memoizada por request via
// React cache, então isso não dobra a consulta ao banco).
//
// Por que a sobrescrita por query existe: o filtro de categoria da sidebar
// (AdsSidebar -> useAdsFilters.setCategoria) navega via router.push(pathname
// + "?categoria=X") na MESMA pathname atual — herdado de /listagem sem
// nenhuma mudança nesta rodada (fora do escopo tocar nesses arquivos, usados
// também por /listagem e /vendedor/[id]). Sem essa sobrescrita, escolher uma
// categoria diferente no filtro lateral desta página mudaria a URL mas não
// teria NENHUM efeito nos resultados (ficaria preso na categoria do slug).
// Limitação conhecida e não resolvida nesta rodada: escolher "Todas as
// Categorias" no filtro (categoria = '') não gera querystring nenhuma (ver
// getPageUrl em lib/useAdsFilters.ts, que omite parâmetros falsy do
// URLSearchParams) — nesse caso específico a navegação cai de volta no slug
// da rota em vez de esvaziar o filtro. Corrigir isso de verdade exigiria
// alterar AdsSidebar/useAdsFilters para conhecer rotas por slug, o que fica
// fora do escopo desta rodada (arquivos compartilhados, fora da lista autorizada).
async function resolveCategoryContext(slug: string, rawParams: { [key: string]: string | string[] | undefined }) {
  const allCategories = await getAllCategories();
  const pageCategory = allCategories.find((c: any) => c.id === slug);
  if (!pageCategory) return null;

  const overrideRaw = rawParams.categoria;
  const override = Array.isArray(overrideRaw) ? overrideRaw[0] : overrideRaw;
  const effectiveCategoriaId = (override && allCategories.some((c: any) => c.id === override)) ? override : slug;
  const effectiveCategory = allCategories.find((c: any) => c.id === effectiveCategoriaId) || pageCategory;

  return { allCategories, pageCategory, effectiveCategoriaId, effectiveCategory };
}

function categoryDisplayName(category: any, lang: Lang): string {
  return (lang === 'es' ? category.name_es : category.name_pt) || category.name_pt || category.name_es || category.id;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const rawParams = await Promise.resolve(searchParams);
  const lang: Lang = (await cookies()).get('tc_lang')?.value === 'es' ? 'es' : 'pt';
  const T = METADATA_TRANSLATIONS[lang];

  const ctx = await resolveCategoryContext(slug, rawParams);
  if (!ctx) notFound();

  const categoryName = categoryDisplayName(ctx.effectiveCategory, lang);
  const title = categoryName;
  const description = T.description(categoryName);

  // Canonical auto-referente (só o slug da rota — não inclui a sobrescrita
  // por ?categoria=, que é um caso de uso do filtro interativo, não uma
  // variante de conteúdo que mereça URL indexável própria).
  const canonicalUrl = `${SITE_URL}/categoria/${slug}`;

  // alternates.languages: diferente de anuncio/[id] e vendedor/[id] (que têm
  // ?lang=pt/?lang=es como URLs de fato distintas), esta página — assim como
  // /listagem — decide o idioma só pelo cookie tc_lang, sem variante de URL
  // própria por idioma (o conteúdo interativo da AdsBrowser/LangProvider
  // também segue só o cookie, não searchParams — ver lib/lang-context.tsx).
  // Implementar um ?lang= aqui deixaria só o HTML gerado no servidor
  // (título/breadcrumb) respeitando-o, sem mudar o restante do widget
  // client-side — pior do que não declarar. Declarar pt-BR/es apontando pra
  // essa MESMA URL comunica corretamente que ela serve os dois idiomas
  // (via cookie), sem inventar uma variante que não existe de fato.
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'pt-BR': canonicalUrl,
        'es': canonicalUrl,
        'x-default': canonicalUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
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

// Mesmo skeleton (mesmas classes globais) do Suspense fallback de
// listagem/page.tsx — não exportado de lá, duplicado aqui por ser puramente
// apresentacional (sem lógica de busca nenhuma).
function CategoriaSkeleton({ lang }: { lang: Lang }) {
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

// JSON-LD ItemList com os anúncios da página atual — mesmo padrão (e mesma
// função, duplicada aqui) de listagem/page.tsx: essa função não é exportada
// de lá, então implementamos inline conforme instruído.
function buildItemListJsonLd(ads: any[], lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: ads.map((ad: any, index: number) => {
      const adTitle = lang === 'es' ? (ad.title_es || ad.title_pt) : ad.title_pt;
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/anuncio/${ad.id}`,
        item: {
          '@type': 'Product',
          name: adTitle,
          image: [
            Array.isArray(ad.images) && ad.images.length > 0
              ? absoluteImageUrl(ad.images[0])
              : FALLBACK_IMG_ABSOLUTE,
          ],
          ...(ad.price ? {
            offers: {
              '@type': 'Offer',
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

async function CategoriaContent({ parsedParams, geoContext, lang, categoryName }: { parsedParams: any, geoContext: any, lang: Lang, categoryName: string }) {
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
      {/* heroTitle força o H1 correto mesmo sem ?categoria= na URL (o padrão
          "acessar /categoria/slug direto"); hideHeroBreadcrumb suprime o
          breadcrumb embutido da AdsBrowser, que usa `categoria` (lida só de
          useSearchParams) e por isso mostraria "Todos os Anúncios" nesse
          mesmo caso comum. O breadcrumb real (crawlável, <Link>) é montado
          abaixo, via `children` — mesmo padrão de Link já usado no
          breadcrumb de anuncio/[id]/page.tsx. */}
      <AdsBrowser
        initialAds={ads}
        initialTotal={total}
        initialGeo={!geoContext.hasManualGeo && geoContext.geoCookie ? geoContext.geoCookie : undefined}
        nextCursor={nextCursor}
        categories={categories}
        heroTitle={categoryName}
        hideHeroBreadcrumb
      >
        <div className="container" style={{ paddingTop: 'var(--sp-4)' }}>
          <nav
            aria-label={METADATA_TRANSLATIONS[lang].navAriaLabel}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', color: 'var(--clr-text-muted)' }}
          >
            <Link href="/" style={{ color: 'var(--clr-text-muted)', fontWeight: 600, textDecoration: 'none' }}>{_t('nav_home', lang)}</Link>
            <span aria-hidden="true">›</span>
            <strong style={{ color: 'var(--clr-text)' }}>{categoryName}</strong>
          </nav>
        </div>
      </AdsBrowser>
    </>
  );
}

export default async function CategoriaPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const rawParams = await Promise.resolve(searchParams);
  const lang: Lang = (await cookies()).get('tc_lang')?.value === 'es' ? 'es' : 'pt';

  const ctx = await resolveCategoryContext(slug, rawParams);
  if (!ctx) notFound();

  const categoryName = categoryDisplayName(ctx.effectiveCategory, lang);

  // Mesma validação de /listagem, forçando `categoria` pra sempre ser a
  // categoria efetiva já resolvida acima (slug da rota, ou a sobrescrita
  // válida por ?categoria=).
  const parsedParams = adsSearchParamsSchema.parse({ ...rawParams, categoria: ctx.effectiveCategoriaId });

  const geoContext = await getGeoParams({
    pais: parsedParams.pais,
    estado: parsedParams.estado,
    cidade: parsedParams.cidade
  });

  try {
    return (
      <Suspense fallback={<CategoriaSkeleton lang={lang} />}>
        <CategoriaContent parsedParams={parsedParams} geoContext={geoContext} lang={lang} categoryName={categoryName} />
      </Suspense>
    );
  } catch (error) {
    logError(error, { route: 'CategoriaPage', params: parsedParams });
    throw new Error('Não foi possível carregar os anúncios neste momento. Tente novamente mais tarde.');
  }
}
