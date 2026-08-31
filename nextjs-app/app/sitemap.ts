import { MetadataRoute } from 'next';
import { createAnonClient } from '@/lib/supabase-server';
import { buildHreflangAlternates } from '@/lib/locale';

// Cada entrada aponta pra URL canônica em PT e declara a variante ES via
// alternates.languages (mesmo mecanismo de generateMetadata em cada página —
// ver lib/locale.ts) — NÃO duplica uma entrada <url> própria por locale.
// Documentação oficial do Next (sitemap.md) e o próprio schema do
// sitemaps.org recomendam exatamente esse padrão: uma entrada por URL
// canônica, com <xhtml:link rel="alternate" hreflang="..."> apontando pras
// variantes, em vez de linhas duplicadas por idioma.
function withLang(baseUrl: string, path: string) {
  return buildHreflangAlternates(baseUrl, path);
}

// Usamos createAnonClient() (não createClient()) porque todo o conteúdo
// deste sitemap é público — createClient() lê cookies() (API de request-time
// que força o Next a tratar a rota como dinâmica em toda requisição).
// createAnonClient() faz suas queries via fetch com `next: { revalidate:
// 3600 }` (ver lib/supabase-server.ts), então o próprio Next.js cacheia os
// resultados das consultas por até 1h via Data Cache — é isso que evita que
// cada crawl dispare múltiplos roundtrips de banco.
//
// IMPORTANTE — por que não há um `headers().set('Cache-Control', ...)` ou
// equivalente aqui: em Next 16.3.2, o Route Handler que envolve sitemap.ts é
// inteiramente gerado pelo framework (ver
// node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js,
// função getSingleSitemapRouteCode) e SEMPRE monta a resposta como
//   new NextResponse(content, { headers: { 'Cache-Control': 'public,
//   max-age=0, must-revalidate' } })
// — um valor hardcoded no loader, sem ler nenhum export deste arquivo.
// sitemap.ts só pode retornar dados (MetadataRoute.Sitemap), nunca um
// Response/NextResponse próprio, então não existe API para sobrescrever esse
// header a partir daqui (confirmado lendo o loader; também não há branch ali
// que leve em conta `dynamic`/`revalidate`). Setar um Cache-Control
// customizado (ex.: 's-maxage=3600, stale-while-revalidate=86400') exigiria
// mudar o Next.js em si. `export const revalidate` abaixo é o mecanismo que
// este tipo de arquivo realmente expõe (doc oficial: "sitemap.js is a
// special Route Handler that is cached by default unless it uses a
// Request-time API or dynamic config option") — com ele o handler roda no
// máximo 1x/hora (ISR), o que também reduz os roundtrips de banco por crawl.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tauzeclass.com.br';

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: { languages: withLang(baseUrl, '/') },
    },
    {
      url: `${baseUrl}/listagem`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.9,
      alternates: { languages: withLang(baseUrl, '/listagem') },
    },
    {
      url: `${baseUrl}/institucional`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
      alternates: { languages: withLang(baseUrl, '/institucional') },
    },
    {
      url: `${baseUrl}/planos`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: { languages: withLang(baseUrl, '/planos') },
    },
    {
      url: `${baseUrl}/eventos`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: { languages: withLang(baseUrl, '/eventos') },
    },
    {
      url: `${baseUrl}/leiloes`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: { languages: withLang(baseUrl, '/leiloes') },
    },
  ];

  try {
    const supabase = createAnonClient();

    // BUG CORRIGIDO (auditoria de SEO): /categoria/[slug] é uma landing
    // pública indexável (tem generateMetadata, canonical e JSON-LD próprios
    // — ver app/(public)/categoria/[slug]/page.tsx) e é linkada de propósito
    // na home (JSON-LD Organization/ItemList) e no rodapé, mas nunca entrava
    // no sitemap — confirmado gerando o sitemap.xml ao vivo (zero URLs
    // "/categoria/"). Query direta via createAnonClient() (não
    // getAllCategories(), que usa createClient() e leria cookies(), forçando
    // esta rota a virar dinâmica — mesmo motivo pelo qual ads/profiles
    // também usam createAnonClient() aqui).
    type CategoryRow = { id: string };
    const { data: categoriesData, error: categoriesErr } = await supabase
      .from('categories')
      .select('id')
      .eq('active', true);
    if (categoriesErr) throw categoriesErr;

    const categoryEntries: MetadataRoute.Sitemap = (categoriesData || []).map((c: CategoryRow) => ({
      url: `${baseUrl}/categoria/${c.id}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: { languages: withLang(baseUrl, `/categoria/${c.id}`) },
    }));

    // Fetch all active ads — paginado de verdade via .range(), em lotes de
    // 1000. Sem isso, o PostgREST aplica um limite default (~1000 linhas) por
    // resposta sem avisar, e sem .order() o subconjunto retornado não é
    // determinístico entre execuções (relevante aqui porque este handler
    // pode rodar de novo a cada `revalidate` segundos).
    // MIGRAÇÃO UUID→SLUG: /anuncio, /vendedor e /leiloes agora usam slug na
    // URL pública (ver supabase/migrations/20260830100000_..., ads.slug/
    // profiles.slug/auction_events.slug) — o sitemap precisa listar a URL
    // canônica de slug, nunca o UUID cru (que só sobrevive como fallback
    // com 301, não deve ser o que o Google indexa a partir daqui).
    type AdRow = { id: string; slug: string; user_id: string | null; updated_at: string | null; created_at: string };
    const PAGE_SIZE = 1000;
    const ads: AdRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('ads')
        .select('id, slug, user_id, updated_at, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      ads.push(...(data as AdRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    const adEntries: MetadataRoute.Sitemap = ads.map((ad) => ({
      url: `${baseUrl}/anuncio/${ad.slug}`,
      lastModified: ad.updated_at || ad.created_at,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: { languages: withLang(baseUrl, `/anuncio/${ad.slug}`) },
    }));

    // Vendedores com pelo menos um ad ativo — reaproveita os user_id já
    // trazidos pela busca de ads acima (sem roundtrip extra só pra descobrir
    // quem tem anúncio ativo). lastModified vem de profiles.updated_at/
    // created_at reais (não de `new Date()`).
    const sellerIds = Array.from(
      new Set(ads.map((ad) => ad.user_id).filter((id): id is string => !!id))
    );
    type ProfileRow = { id: string; slug: string; updated_at: string | null; created_at: string };
    const profiles: ProfileRow[] = [];
    const PROFILE_CHUNK = 500;
    for (let i = 0; i < sellerIds.length; i += PROFILE_CHUNK) {
      const chunk = sellerIds.slice(i, i + PROFILE_CHUNK);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, slug, updated_at, created_at')
        .in('id', chunk);
      if (error) throw error;
      if (data) profiles.push(...(data as ProfileRow[]));
    }

    const sellerEntries: MetadataRoute.Sitemap = profiles.map((p) => ({
      url: `${baseUrl}/vendedor/${p.slug}`,
      lastModified: p.updated_at || p.created_at,
      changeFrequency: 'weekly',
      priority: 0.6,
      alternates: { languages: withLang(baseUrl, `/vendedor/${p.slug}`) },
    }));

    // Fetch upcoming/live events (auction_events) e feiras (eventos) —
    // /eventos/[id] resolve ambas as tabelas (ver app/(public)/eventos/[id]/page.tsx)
    // e continua indexada pelo UUID de cada tabela — só `eventos` não recebeu
    // slug nesta migração (apenas ads/profiles/auction_events). Nenhuma das
    // duas tem coluna `updated_at`, só `created_at`.
    const { data: auctionEvents, error: auctionErr } = await supabase
      .from('auction_events')
      .select('id, slug, created_at')
      .neq('status', 'draft');
    if (auctionErr) throw auctionErr;

    const { data: eventos, error: eventosErr } = await supabase
      .from('eventos')
      .select('id, created_at');
    if (eventosErr) throw eventosErr;

    const eventEntries: MetadataRoute.Sitemap = [
      ...(auctionEvents || []),
      ...(eventos || []),
    ].map((ev: any) => ({
      url: `${baseUrl}/eventos/${ev.id}`,
      lastModified: ev.created_at,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: withLang(baseUrl, `/eventos/${ev.id}`) },
    }));

    // /leiloes/[slug] resolve só contra auction_events (ver
    // app/(public)/leiloes/[slug]/page.tsx), diferente de /eventos/[id] acima —
    // por isso é uma lista de entradas separada, não junta com `eventos`.
    const auctionRouteEntries: MetadataRoute.Sitemap = (auctionEvents || []).map((ev: any) => ({
      url: `${baseUrl}/leiloes/${ev.slug}`,
      lastModified: ev.created_at,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: withLang(baseUrl, `/leiloes/${ev.slug}`) },
    }));

    return [
      ...staticRoutes,
      ...categoryEntries,
      ...adEntries,
      ...sellerEntries,
      ...eventEntries,
      ...auctionRouteEntries,
    ];
  } catch (err) {
    console.error('Error generating dynamic sitemap:', err);
    // Graceful fallback if database fails
    return staticRoutes;
  }
}
