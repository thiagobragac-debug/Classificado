import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import AdsBrowser from '@/components/ads/AdsBrowser';
import { getGeoParams, getAllCategories } from '@/lib/listagem-utils';
import { getAdsListagemComFallbackGeografico, adsSearchParamsSchema } from '@/lib/services/ads.service';
import { logError } from '@/lib/monitoring';
import { t as _t, type Lang } from '@/lib/constants';
import { escapeJsonLd } from '@/lib/json-ld';
import { imageUrl } from '@/lib/storage';
import { getLocale } from '@/lib/locale-server';
import { localizedPath, buildHreflangAlternates, SITE_URL } from '@/lib/locale';

// Página de categoria (/categoria/[slug]) — landing pública, indexável, de
// uma categoria específica. Reaproveita a MESMA lógica de busca/paginação de
// anúncios já usada por app/(public)/listagem/page.tsx (getAdsListagem,
// adsSearchParamsSchema, getGeoParams, getAllCategories, AdsBrowser) — só
// filtrando sempre por uma categoria, resolvida a partir do [slug] da rota.
// categories.id JÁ É o "slug" (texto legível, ex.: "gado-de-corte") — ver
// a geração de id em app/(admin)/admin/categorias/page.tsx (handleSave):
// nome slugificado, sem migração nova necessária.

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

// BUG CORRIGIDO (achado pelo usuário ao vivo): title/description usavam só o
// nome técnico da categoria ("Bovinos", "Equinos") — quase ninguém busca no
// Google com esse vocabulário; as pessoas digitam do jeito que falam no dia
// a dia ("comprar boi", "vender vaca leiteira", "cavalo pra venda"). O nome
// da categoria em si (navegação, filtros, H1 da listagem) NÃO muda — só o
// texto usado pra indexação (title/description), pra casar com a busca real
// sem inventar categoria nova nenhuma. 'cat-outros' fica de fora de
// propósito: é o catch-all genérico, sem um conjunto natural de termos.
const CATEGORY_COLLOQUIAL_TERMS: Partial<Record<string, { pt: string[]; es: string[] }>> = {
  'cat-bovinos': { pt: ['boi', 'vaca', 'touro', 'novilha'], es: ['buey', 'vaca', 'toro', 'novilla'] },
  'cat-equinos': { pt: ['cavalo', 'égua', 'garanhão', 'potro'], es: ['caballo', 'yegua', 'semental', 'potro'] },
  'cat-suinos': { pt: ['porco', 'porca', 'leitão'], es: ['cerdo', 'chancho', 'lechón'] },
  'caprinos': { pt: ['cabra', 'bode', 'cabrito'], es: ['cabra', 'chivo', 'cabrito'] },
  'cat-ovinos': { pt: ['ovelha', 'carneiro', 'cordeiro'], es: ['oveja', 'carnero', 'cordero'] },
  'cat-aves': { pt: ['galinha', 'frango', 'galo', 'poedeira'], es: ['gallina', 'pollo', 'gallo', 'ponedora'] },
  'cat-aquicult': { pt: ['peixe', 'tilápia', 'camarão'], es: ['pez', 'tilapia', 'camarón'] },
  'cat-insumos': { pt: ['ração', 'sementes', 'fertilizante'], es: ['ración', 'semillas', 'fertilizante'] },
  // BUG CORRIGIDO (comprimento de title): os 4 abaixo com 3 termos (frases
  // compostas, não palavras soltas como "boi") passavam de 80-100
  // caracteres — o Google trunca o <title> no resultado de busca por volta
  // de ~60-70, cortando literalmente "| Tauze Class" (ou pior, parte do
  // termo). Reduzidos pra 2 termos cada, mantendo os mais buscados.
  'medicamentos': { pt: ['vacina', 'antibiótico'], es: ['vacuna', 'antibiótico'] },
  'cat-genetica': { pt: ['sêmen', 'embrião'], es: ['semen', 'embrión'] },
  'cat-imoveis': { pt: ['fazenda', 'sítio'], es: ['finca', 'campo'] },
  'cat-maquinas': { pt: ['trator', 'colheitadeira'], es: ['tractor', 'cosechadora'] },
  'cat-servicos': { pt: ['veterinário', 'leilão'], es: ['veterinario', 'remate'] },
};

// "boi, vaca e touro" (pt) / "buey, vaca y toro" (es) — junção natural sem
// vírgula sobrando antes do último item.
function joinNatural(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] || '';
  const conj = lang === 'es' ? 'y' : 'e';
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildCategoryTitle(categoryName: string, categoryId: string, lang: Lang): string {
  const terms = CATEGORY_COLLOQUIAL_TERMS[categoryId]?.[lang];
  if (!terms) return categoryName;
  const list = capitalize(joinNatural(terms, lang));
  return lang === 'es'
    ? `${categoryName}: Compra y Venta de ${list}`
    : `${categoryName}: Compre e Venda ${list}`;
}

function buildCategoryDescription(categoryName: string, categoryId: string, lang: Lang): string {
  const terms = CATEGORY_COLLOQUIAL_TERMS[categoryId]?.[lang];
  if (!terms) return METADATA_TRANSLATIONS[lang].description(categoryName);
  const list = joinNatural(terms, lang);
  return lang === 'es'
    ? `Compra y vende ${list} y más en Tauze Class. El clasificado agro más grande del Mercosur.`
    : `Compre e venda ${list} e mais na Tauze Class. O maior classificado agro do Mercosul.`;
}

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
  const lang: Lang = await getLocale();

  const ctx = await resolveCategoryContext(slug, rawParams);
  if (!ctx) notFound();

  // BUG CORRIGIDO (auditoria de SEO): title/description e canonical usavam
  // ctx.pageCategory (a categoria da ROTA) e o `slug` cru, ignorando a
  // sobrescrita por ?categoria= — só que o CORPO da página (CategoriaContent,
  // mais abaixo neste arquivo) sempre renderizou o conteúdo da categoria
  // EFETIVA (ctx.effectiveCategory: a sobrescrita quando válida, senão a
  // própria categoria da rota). Resultado: acessar /categoria/gado?categoria=
  // suinos listava anúncios de suínos, com H1/breadcrumb de "Suínos", mas
  // title/description/canonical continuavam descrevendo "Gado" — uma
  // divergência real entre o que o canonical declara e o que a página
  // efetivamente mostra. Usar ctx.effectiveCategory nos três resolve isso: se
  // não há sobrescrita, effectiveCategory === pageCategory (comportamento
  // idêntico ao de antes); se há, a página passa a se autodeclarar
  // corretamente como a página de "Suínos" — que, por sinal, já é uma URL
  // real e indexável (/categoria/suinos já existe e está no sitemap), então
  // apontar o canonical pra lá não introduz uma URL nova nem inventa conteúdo.
  const categoryName = categoryDisplayName(ctx.effectiveCategory, lang);
  const title = buildCategoryTitle(categoryName, ctx.effectiveCategoriaId, lang);
  const description = buildCategoryDescription(categoryName, ctx.effectiveCategoriaId, lang);

  // BUG CRÍTICO CORRIGIDO (migração de SEO): antes esta página declarava
  // pt-BR/es apontando pra essa MESMA URL, porque o idioma dependia só do
  // cookie tc_lang — sem variante de URL própria. Isso mudou: /es/categoria/
  // {slug} agora é uma URL real e distinta (rewrite em proxy.ts), então o
  // par hreflang completo (mesmo mecanismo do resto do site) passa a ser
  // válido de verdade, igual a /listagem.
  const path = `/categoria/${ctx.effectiveCategoriaId}`;
  const canonicalUrl = `${SITE_URL}${localizedPath(path, lang)}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildHreflangAlternates(SITE_URL, path),
    },
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
      const adUrl = `${SITE_URL}${localizedPath(`/anuncio/${ad.slug}`, lang)}`;
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: adUrl,
        item: {
          '@type': 'Product',
          name: adTitle,
          url: adUrl,
          image: [
            Array.isArray(ad.images) && ad.images.length > 0
              ? absoluteImageUrl(ad.images[0])
              : FALLBACK_IMG_ABSOLUTE,
          ],
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

async function CategoriaContent({ parsedParams, geoContext, lang, categoryName, slug }: { parsedParams: any, geoContext: any, lang: Lang, categoryName: string, slug: string }) {
  const [
    { ads, total, nextCursor, geoFallback },
    categories
  ] = await Promise.all([
    getAdsListagemComFallbackGeografico(parsedParams, geoContext),
    getAllCategories()
  ]);

  const itemListJsonLd = buildItemListJsonLd(ads, lang);

  // BUG CORRIGIDO (auditoria de SEO, 2ª rodada): mesmo breadcrumb visual
  // real (<nav> abaixo, Início > Nome da Categoria) sem o BreadcrumbList
  // correspondente — mesmo padrão já aplicado em anuncio/[id]/page.tsx.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: _t('nav_home', lang), item: `${SITE_URL}${localizedPath('/', lang)}` },
      { '@type': 'ListItem', position: 2, name: categoryName, item: `${SITE_URL}${localizedPath(`/categoria/${slug}`, lang)}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(breadcrumbJsonLd) }}
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
        geoFallback={geoFallback}
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
  const lang: Lang = await getLocale();

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
    cidade: parsedParams.cidade,
    lat: parsedParams.lat,
    lng: parsedParams.lng,
  });

  try {
    return (
      <Suspense fallback={<CategoriaSkeleton lang={lang} />}>
        <CategoriaContent parsedParams={parsedParams} geoContext={geoContext} lang={lang} categoryName={categoryName} slug={slug} />
      </Suspense>
    );
  } catch (error) {
    logError(error, { route: 'CategoriaPage', params: parsedParams });
    throw new Error('Não foi possível carregar os anúncios neste momento. Tente novamente mais tarde.');
  }
}
