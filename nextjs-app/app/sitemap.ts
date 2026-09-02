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

// Maior data válida entre as fornecidas (ISO string ou null/undefined) — usada
// pra derivar um lastModified HONESTO a partir de dados reais já buscados do
// banco, em vez de `new Date()` (o instante de geração do sitemap). Ignora
// entradas ausentes; retorna undefined se nenhuma data válida sobrar (o campo
// é opcional em MetadataRoute.Sitemap — melhor omitir do que inventar).
function maxDate(dates: Array<string | null | undefined>): Date | undefined {
  let max: Date | undefined;
  for (const d of dates) {
    if (!d) continue;
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) continue;
    if (!max || parsed > max) max = parsed;
  }
  return max;
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

  // Fallback de EMERGÊNCIA — só usado se a consulta ao banco falhar por
  // completo (ver catch no fim da função). `new Date()` só é aceitável aqui:
  // é o único cenário em que não sobra nenhum dado real do banco pra derivar
  // uma data honesta, e ainda assim é preferível a devolver um sitemap vazio.
  const emergencyStaticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0, alternates: { languages: withLang(baseUrl, '/') } },
    { url: `${baseUrl}/listagem`, lastModified: new Date(), changeFrequency: 'always', priority: 0.9, alternates: { languages: withLang(baseUrl, '/listagem') } },
    { url: `${baseUrl}/planos`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6, alternates: { languages: withLang(baseUrl, '/planos') } },
    { url: `${baseUrl}/eventos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8, alternates: { languages: withLang(baseUrl, '/eventos') } },
    { url: `${baseUrl}/leiloes`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8, alternates: { languages: withLang(baseUrl, '/leiloes') } },
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

    // BUG CORRIGIDO (SEO — canonical mismatch): a entrada estática genérica
    // de `/institucional` (sem query string) apontava pra uma URL diferente
    // da que a própria página declara como canônica pra si mesma —
    // confirmado ao vivo: fetch('/institucional') devolve
    // <link rel="canonical" href=".../institucional?page=sobre">, porque
    // generateMetadata() em institucional/page.tsx usa
    // pageParam = params.page ?? 'sobre' e canonicaliza pra
    // `/institucional?page=${pageData.id}` (nunca pra `/institucional` puro).
    // Isso é o padrão clássico de "Submitted URL not selected as canonical"
    // no Search Console. Além disso, das 10 páginas institucionais reais, só
    // a de 'sobre' tinha qualquer entrada no sitemap — as outras 9
    // dependiam 100% de link interno (sidebar) pra serem descobertas. Troca
    // a entrada única por uma entrada por página real, buscada do banco —
    // mesmo padrão de categoryEntries/adEntries acima. Sem filtro de
    // ativo/publicado porque a própria página (institucional/page.tsx) faz
    // `.select('*')` sem esse filtro — replicar um filtro aqui esconderia do
    // sitemap páginas que a página pública mostra normalmente.
    type InstitutionalPageRow = { id: string; updated_at: string | null };
    const { data: institutionalPagesData, error: institutionalErr } = await supabase
      .from('institutional_pages')
      .select('id, updated_at');
    if (institutionalErr) throw institutionalErr;

    const institutionalEntries: MetadataRoute.Sitemap = (institutionalPagesData || []).map(
      (p: InstitutionalPageRow) => ({
        url: `${baseUrl}/institucional?page=${p.id}`,
        lastModified: p.updated_at || undefined,
        changeFrequency: 'monthly',
        priority: 0.5,
        alternates: { languages: withLang(baseUrl, `/institucional?page=${p.id}`) },
      })
    );

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
    //
    // `category_id` entrou no select (auditoria de SEO, correção de
    // lastModified): usado só pra derivar a data real de "última mudança"
    // de cada categoria abaixo (categoryLastModified) — nunca exposto numa
    // URL nem enviado ao cliente.
    type AdRow = { id: string; slug: string; user_id: string | null; category_id: string | null; updated_at: string | null; created_at: string };
    const PAGE_SIZE = 1000;
    const ads: AdRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('ads')
        .select('id, slug, user_id, category_id, updated_at, created_at')
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

    // BUG CORRIGIDO (auditoria de SEO): lastModified de categoria era sempre
    // `new Date()` (o instante em que o sitemap foi gerado) — como
    // `revalidate = 3600` faz este handler rodar de novo a cada hora, o
    // <lastmod> de TODA categoria mudava a cada hora mesmo sem nenhum
    // anúncio novo, um sinal que buscadores tendem a passar a ignorar
    // quando provado falso repetidamente. `categories` não expõe uma coluna
    // updated_at própria (não confirmada no schema — arriscado assumir),
    // então derivamos a data real da categoria do anúncio ATIVO mais
    // recente dela (já temos `ads` acima, com category_id): é o sinal mais
    // fiel disponível de "quando essa categoria teve conteúdo novo pela
        // última vez". Categoria sem nenhum anúncio ativo fica sem
    // lastModified (undefined é válido no tipo Sitemap) — melhor omitir do
    // que inventar uma data.
    const categoryLastModified = new Map<string, Date>();
    for (const ad of ads) {
      if (!ad.category_id) continue;
      const d = maxDate([ad.updated_at, ad.created_at]);
      if (!d) continue;
      const prev = categoryLastModified.get(ad.category_id);
      if (!prev || d > prev) categoryLastModified.set(ad.category_id, d);
    }

    const categoryEntries: MetadataRoute.Sitemap = (categoriesData || []).map((c: CategoryRow) => ({
      url: `${baseUrl}/categoria/${c.id}`,
      lastModified: categoryLastModified.get(c.id),
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: { languages: withLang(baseUrl, `/categoria/${c.id}`) },
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

    // Fetch upcoming/live events (auction_events) e feiras (eventos).
    //
    // BUG CRÍTICO CORRIGIDO (auditoria de SEO — verificação ao vivo desta
    // rodada): esta função antes juntava auction_events + eventos numa única
    // `eventEntries`, listando `/eventos/{id}` pra AMBAS as tabelas. Só que
    // proxy.ts (bloco EVENTO_AUCTION_REGEX) intercepta qualquer acesso a
    // `/eventos/{uuid-de-leilão}` e responde com um redirect 308 PERMANENTE
    // pra `/leiloes/{slug}` — correção deliberada de conteúdo quase-duplicado
    // (ver comentário lá e em eventos/[id]/page.tsx::findEvent). Confirmado
        // ao vivo nesta auditoria: GET /eventos/{uuid de auction_events} responde
    // 308 → /leiloes/{slug}, pra TODO leilão não-draft, sem exceção. O
    // sitemap nunca tinha sido atualizado pra refletir essa regra — ele
    // enviava ao Google exatamente a URL que o próprio site redireciona,
    // desperdiçando crawl budget e virando "Página com redirecionamento" no
    // Search Console em vez de "Indexada". `eventEntries` agora só nasce da
    // tabela `eventos` (feiras reais — Expointer, Agrishow etc. — que não
    // têm rota alternativa nem sofrem esse redirect); `auction_events`
    // continua indexado exclusivamente via `auctionRouteEntries` abaixo
    // (/leiloes/{slug}), a única URL que responde 200 de verdade pra um
    // leilão. Nenhuma das duas tabelas tem coluna `updated_at`, só
    // `created_at`.
    const { data: auctionEvents, error: auctionErr } = await supabase
      .from('auction_events')
      .select('id, slug, created_at')
      .neq('status', 'draft');
    if (auctionErr) throw auctionErr;

    const { data: eventos, error: eventosErr } = await supabase
      .from('eventos')
      .select('id, created_at');
    if (eventosErr) throw eventosErr;

    const eventEntries: MetadataRoute.Sitemap = (eventos || []).map((ev) => ({
      url: `${baseUrl}/eventos/${ev.id}`,
      lastModified: ev.created_at,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: withLang(baseUrl, `/eventos/${ev.id}`) },
    }));

    // /leiloes/[slug] resolve só contra auction_events (ver
    // app/(public)/leiloes/[slug]/page.tsx) — única entrada indexável pra
    // cada leilão (ver correção acima).
    const auctionRouteEntries: MetadataRoute.Sitemap = (auctionEvents || []).map((ev) => ({
      url: `${baseUrl}/leiloes/${ev.slug}`,
      lastModified: ev.created_at,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: { languages: withLang(baseUrl, `/leiloes/${ev.slug}`) },
    }));

    // BUG CORRIGIDO (auditoria de SEO): as 5 rotas estáticas abaixo usavam
    // `lastModified: new Date()` incondicionalmente — o instante de geração
    // do sitemap, não uma mudança real de conteúdo. Home/listagem/eventos/
    // leilões agregam conteúdo que de fato muda com frequência (novos
    // anúncios/eventos), então derivamos a data do registro mais recente já
    // buscado acima em vez de "agora". /planos é essencialmente estático
    // (sem tabela própria que rastreie a última mudança de preço) — fica sem
    // lastModified, honesto sobre não termos essa informação, em vez de
    // inventar uma data que muda toda hora sem motivo.
    const latestAdDate = maxDate(ads.length > 0 ? [ads[0].updated_at, ads[0].created_at] : []);
    const latestEventDate = maxDate([
      ...(eventos || []).map((e) => e.created_at),
      ...(auctionEvents || []).map((e) => e.created_at),
    ]);
    const latestAuctionDate = maxDate((auctionEvents || []).map((e) => e.created_at));

    const staticRoutes: MetadataRoute.Sitemap = [
      {
        url: `${baseUrl}`,
        lastModified: latestAdDate,
        changeFrequency: 'daily',
        priority: 1.0,
        alternates: { languages: withLang(baseUrl, '/') },
      },
      {
        url: `${baseUrl}/listagem`,
        lastModified: latestAdDate,
        changeFrequency: 'always',
        priority: 0.9,
        alternates: { languages: withLang(baseUrl, '/listagem') },
      },
      {
        url: `${baseUrl}/planos`,
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: { languages: withLang(baseUrl, '/planos') },
      },
      {
        url: `${baseUrl}/eventos`,
        lastModified: latestEventDate,
        changeFrequency: 'daily',
        priority: 0.8,
        alternates: { languages: withLang(baseUrl, '/eventos') },
      },
      {
        url: `${baseUrl}/leiloes`,
        lastModified: latestAuctionDate,
        changeFrequency: 'daily',
        priority: 0.8,
        alternates: { languages: withLang(baseUrl, '/leiloes') },
      },
    ];

    return [
      ...staticRoutes,
      ...categoryEntries,
      ...institutionalEntries,
      ...adEntries,
      ...sellerEntries,
      ...eventEntries,
      ...auctionRouteEntries,
    ];
  } catch (err) {
    console.error('Error generating dynamic sitemap:', err);
    // Graceful fallback if database fails
    return emergencyStaticRoutes;
  }
}
