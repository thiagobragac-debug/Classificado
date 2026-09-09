import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { logError } from '@/lib/monitoring';
import { RADIUS_CLOSE_KM, RADIUS_WIDE_KM, type GeoFallbackLevel } from '@/lib/geo-cascade';

const PAGE_SIZE = 24;

export const BR_STATES: Record<string, string> = {
  'Acre': 'AC', 'AC': 'Acre',
  'Alagoas': 'AL', 'AL': 'Alagoas',
  'Amapá': 'AP', 'AP': 'Amapá',
  'Amazonas': 'AM', 'AM': 'Amazonas',
  'Bahia': 'BA', 'BA': 'Bahia',
  'Ceará': 'CE', 'CE': 'Ceará',
  'Distrito Federal': 'DF', 'DF': 'Distrito Federal',
  'Espírito Santo': 'ES', 'ES': 'Espírito Santo',
  'Goiás': 'GO', 'GO': 'Goiás',
  'Maranhão': 'MA', 'MA': 'Maranhão',
  'Mato Grosso': 'MT', 'MT': 'Mato Grosso',
  'Mato Grosso do Sul': 'MS', 'MS': 'Mato Grosso do Sul',
  'Minas Gerais': 'MG', 'MG': 'Minas Gerais',
  'Pará': 'PA', 'PA': 'Pará',
  'Paraíba': 'PB', 'PB': 'Paraíba',
  'Paraná': 'PR', 'PR': 'Paraná',
  'Pernambuco': 'PE', 'PE': 'Pernambuco',
  'Piauí': 'PI', 'PI': 'Piauí',
  'Rio de Janeiro': 'RJ', 'RJ': 'Rio de Janeiro',
  'Rio Grande do Norte': 'RN', 'RN': 'Rio Grande do Norte',
  'Rio Grande do Sul': 'RS', 'RS': 'Rio Grande do Sul',
  'Rondônia': 'RO', 'RO': 'Rondônia',
  'Roraima': 'RR', 'RR': 'Roraima',
  'Santa Catarina': 'SC', 'SC': 'Santa Catarina',
  'São Paulo': 'SP', 'SP': 'São Paulo',
  'Sergipe': 'SE', 'SE': 'Sergipe',
  'Tocantins': 'TO', 'TO': 'Tocantins',
};

// Modificado para suportar cursor em vez de page
export const adsSearchParamsSchema = z.object({
  cursor: z.string().optional(),
  page: z.coerce.number().min(1).catch(1).optional(), // Mantido temporariamente para retrocompatibilidade
  pais: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  estado: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  cidade: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  // Coordenadas da busca por raio em KM — ver getAdsListagemComFallbackGeografico.
  // String->number manual (em vez de z.coerce.number()) porque precisa
  // tratar entrada ausente/inválida como "sem coordenada" (undefined),
  // nunca como 0 — z.coerce.number() sozinho aceita '' como 0 (coerção do
  // JS), o que apontaria pro Golfo da Guiné em vez de "sem localização".
  lat: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val)
    .transform(val => {
      if (!val) return undefined;
      const n = Number(val);
      return Number.isFinite(n) && n >= -90 && n <= 90 ? n : undefined;
    }).optional(),
  lng: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val)
    .transform(val => {
      if (!val) return undefined;
      const n = Number(val);
      return Number.isFinite(n) && n >= -180 && n <= 180 ? n : undefined;
    }).optional(),
  // Raio em KM escolhido manualmente pelo usuário (AdsSidebar.tsx) —
  // sobrescreve a escada automática 100km->300km com um único valor.
  // Faixa 1-2000km: acima disso não é mais "raio", é praticamente
  // "qualquer lugar do Mercosul", sem sentido prático.
  raio: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val)
    .transform(val => {
      if (!val) return undefined;
      const n = Number(val);
      return Number.isFinite(n) && n > 0 && n <= 2000 ? n : undefined;
    }).optional(),
  categoria: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  subcategoria: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  finalidade: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
  seller_id: z.string().optional(),
  preco_min: z.coerce.number().optional(),
  preco_max: z.coerce.number().optional(),
  busca: z.union([z.string(), z.array(z.string())])
    .transform(val => Array.isArray(val) ? val[0] : val)
    .transform(val => val?.trim().slice(0, 200)) // máximo 200 chars — previne sobrecarga do parser FTS
    .optional(),
  ordem: z.enum(['recent', 'price_asc', 'price_desc', 'featured']).catch('recent'),
  destaque: z.enum(['true', 'false']).optional(),
  negociavel: z.enum(['true', 'false']).optional(),
});

export type AdsSearchParams = z.infer<typeof adsSearchParamsSchema>;

export const adSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title_pt: z.string(),
  title_es: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  price_unit_pt: z.string().nullable().optional(),
  price_unit_es: z.string().nullable().optional(),
  negotiable: z.boolean().nullable().optional(),
  country: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  location_text: z.string().nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  tags_pt: z.array(z.string()).nullable().optional(),
  tags_es: z.array(z.string()).nullable().optional(),
  status: z.string().nullable().optional(),
  featured: z.boolean().nullable().optional(),
  created_at: z.string(),
  category_id: z.string().nullable().optional(),
});

export const adsResponseSchema = z.array(adSchema);
export type AdValidated = z.infer<typeof adSchema>;

// idsFilter é de uso INTERNO (busca por raio, ver
// getAdsListagemComFallbackGeografico abaixo) — nunca vem direto de query
// param do usuário, por isso não faz parte de AdsSearchParams/zod.
export async function getAdsListagem(params: AdsSearchParams, geoContext: any, idsFilter?: string[]): Promise<{ ads: any[]; total: number; nextCursor: string | undefined }> {
  const sb = await createClient();

  let q = sb.from('ads')
    // BUG CORRIGIDO (achado durante a validação do zero de i18n): a
    // migration 20260827100000_i18n_colunas_es.sql adicionou price_unit_es
    // e tags_es especificamente pra AdCard.tsx poder mostrar essas colunas
    // em espanhol (mesmo padrão já usado pra title_es) — mas este select
    // explícito nunca as buscava, então a listagem sempre caía no fallback
    // _pt, mesmo pra anúncios com tradução real preenchida.
    .select('id, slug, title_pt, title_es, price, currency, price_unit_pt, price_unit_es, negotiable, country, state, city, location_text, images, tags_pt, tags_es, status, featured, created_at, category_id', { count: 'exact' })
    .eq('status', 'active');

  // Busca por raio em KM (ver getAdsListagemComFallbackGeografico) — os ids
  // já vêm filtrados por distância via RPC; aqui só restringe a consulta
  // normal (categoria/preço/etc.) a esse conjunto.
  if (idsFilter) q = q.in('id', idsFilter);

  // Filtros geográficos e de categoria
  if (params.categoria) q = q.eq('category_id', params.categoria);
  // Subcategoria aceita múltipla seleção no filtro (lista separada por
  // vírgula na URL, ex.: ?subcategoria=sub-a,sub-b) — usa .in() em vez de
  // .eq() pra cobrir tanto o caso de 1 quanto o de várias raças escolhidas.
  if (params.subcategoria) q = q.in('subcategory_id', params.subcategoria.split(',').filter(Boolean));
  if (params.finalidade) q = q.eq('purpose', params.finalidade);
  if (params.seller_id) q = q.eq('user_id', params.seller_id);
  
  const pais = params.pais || geoContext.pais;
  if (pais && pais !== 'todos') q = q.ilike('country', pais);
  
  const estado = params.estado || geoContext.estado;
  if (estado) {
    const altState = BR_STATES[estado];
    if (altState) {
      q = q.in('state', [estado, altState]);
    } else {
      q = q.ilike('state', estado);
    }
  }
  
  const cidade = params.cidade || geoContext.cidade;
  if (cidade) q = q.ilike('city', cidade);

  // Filtros de valor e status
  if (params.preco_min !== undefined) q = q.gte('price', params.preco_min);
  if (params.preco_max !== undefined) q = q.lte('price', params.preco_max);
  if (params.destaque === 'true') q = q.eq('featured', true);
  if (params.negociavel === 'true') q = q.eq('negotiable', true);
  
  // Full Text Search otimizado utilizando coluna virtual 'fts' gerada na DB
  if (params.busca) {
    // Usamos fts em vez de or(title_pt.ilike, ...)
    // Se o user buscar por multiplas palavras, o textSearch junta com & (AND) natural do psql
    q = q.textSearch('fts', params.busca, { type: 'websearch', config: 'portuguese' });
  }

  // Ordenação e Cursor Pagination
  const ordem = params.ordem;
  if (ordem === 'price_asc') {
    // BUG CORRIGIDO (varredura cruzada de cenários): sem nullsFirst
    // explícito, o Postgres usa o default de ORDER BY ASC (NULLS LAST) pra
    // 'Menor Preço' mas NULLS FIRST pra 'Maior Preço' — um anúncio com
    // price=null ('Sob consulta') aparecia como se fosse o MAIS CARO em
    // 'Maior Preço'. Fixando nullsFirst:false nos dois sentidos, "Sob
    // consulta" sempre fica no final, independente da direção.
    q = q.order('price', { ascending: true, nullsFirst: false });
    // Cursor para preços precisaria de lógica complexa (preço + id), fallback para id/created_at se possível
  } else if (ordem === 'price_desc') {
    q = q.order('price', { ascending: false, nullsFirst: false });
  } else if (ordem === 'featured') {
    q = q.order('featured', { ascending: false }).order('created_at', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: false });
  }

  // Paginação - Se houver cursor e for uma busca simples por created_at
  if (params.cursor && (ordem === 'recent' || !ordem)) {
     // Apenas retorna anúncios criados antes do cursor (que será a data de criação do último item)
     q = q.lt('created_at', params.cursor);
     q = q.limit(PAGE_SIZE);
  } else {
     // Fallback para offset pagination
     const page = params.page || 1;
     const from = (page - 1) * PAGE_SIZE;
     q = q.range(from, from + PAGE_SIZE - 1);
  }

  const { data, count, error } = await q;

  if (error) {
    // BUG CORRIGIDO (varredura cruzada de cenários): a paginação por offset
    // (.range()) nunca checava se `from` ultrapassava o total de linhas
    // existentes. Quando isso acontece (ex.: navegar pra além da última
    // página real), o PostgREST responde com erro "Range Not Satisfiable"
    // (PGRST103) em vez de um array vazio — o catch acima então derrubava a
    // página inteira na tela de erro genérica, em vez do estado vazio
    // "Nenhum anúncio encontrado" que já existe e funciona bem pra busca
    // sem resultado. Reproduzido ao vivo navegando pra uma página além da
    // última com resultados.
    if (error.code === 'PGRST103') {
      // BUG CORRIGIDO (varredura completa de filtros pedida pelo usuário):
      // `count` desestruturado de uma resposta de ERRO do PostgREST vem
      // null/undefined — `count ?? 0` sempre virava 0, perdendo o total
      // REAL (ex.: 34 anúncios válidos nas páginas 1-2) e fazendo a página
      // renderizar "0 encontrados" + sugerir remover um filtro que na
      // verdade tem dezenas de resultados válidos, sem link nenhum pra
      // voltar. Refaz a MESMA busca (mesmos filtros, reconstruídos do zero
      // a partir de `params` pela própria recursão) forçando page=1 — que
      // nunca dispara PGRST103 (offset 0 nunca fica "além" do total, mesmo
      // com 0 linhas) — só pra extrair o `total` real; os `ads` dessa
      // página 1 são descartados de propósito (ver AdsBrowser.tsx) pra não
      // mostrar conteúdo da página 1 "disfarçado" de página 3 — a página
      // pedida continua vazia (honesto), mas agora com total correto e
      // navegação de volta funcionando via ListagemPagination.
      if ((params.page ?? 1) !== 1) {
        const { total: realTotal } = await getAdsListagem({ ...params, page: 1, cursor: undefined }, geoContext, idsFilter);
        return { ads: [], total: realTotal, nextCursor: undefined };
      }
      return { ads: [], total: count ?? 0, nextCursor: undefined };
    }
    logError(error, { context: 'getAdsListagem', params });
    throw new Error('Falha ao carregar anúncios.');
  }

  // Type Safety: Validação do payload retornado do BD
  const validatedAds = adsResponseSchema.parse(data || []);

  // Determinar o próximo cursor
  let nextCursor = undefined;
  if (validatedAds.length === PAGE_SIZE && (ordem === 'recent' || !ordem)) {
    nextCursor = validatedAds[validatedAds.length - 1].created_at;
  } else if (validatedAds.length === PAGE_SIZE) {
     nextCursor = String((params.page || 1) + 1); // Passa a próxima page disfarçada de cursor para fallback
  }

  return {
    ads: validatedAds as any[], // cast to compat with existing Ad interface
    total: count || 0,
    nextCursor,
  };
}

// BUG CORRIGIDO (achado ao vivo pelo usuário): cidade sem nenhum anúncio
// caía direto na tela vazia "Nenhum anúncio encontrado" — sem sugerir nada,
// mesmo já existindo anúncios no estado/país. getAdsListagem (acima) fica
// intocado (outras chamadas, como vendedor/[slug]/page.tsx, continuam
// funcionando exatamente como antes) — este wrapper tenta cidade→estado→
// país→tudo, em ordem, parando no primeiro nível que encontrar pelo menos 1
// anúncio, e informa em `geoFallback` se (e o quanto) a busca precisou
// ampliar, pra a página mostrar um aviso em vez de silenciosamente trocar
// os resultados. Trata localização manual e auto-detectada da mesma forma —
// mesmo critério já usado pelo botão "Remover filtro de X" existente em
// AdsBrowser.tsx (getNarrowestFilterRemoval), que também não distingue as
// duas origens.
export async function getAdsListagemComFallbackGeografico(params: AdsSearchParams, geoContext: any) {
  const cidade = params.cidade || geoContext.cidade;
  const estado = params.estado || geoContext.estado;
  const pais = params.pais || geoContext.pais;
  // BUG CORRIGIDO (plano cascata+raio): quando a localização do visitante
  // tem coordenadas (GPS ou IP-geo — ver lib/useGeoLocation.ts/geoip.ts),
  // raio em KM substitui o match exato de cidade como critério padrão de
  // "Perto de você" — cidade é uma fronteira administrativa arbitrária,
  // alguém a poucos km fora do limite não deveria ficar de fora. Sem
  // coordenadas, cai na escada de texto (cidade→estado→país→tudo) de antes.
  const lat = params.lat ?? geoContext.lat ?? undefined;
  const lng = params.lng ?? geoContext.lng ?? undefined;
  const temCoordenadas = typeof lat === 'number' && typeof lng === 'number';

  type Tentativa = { nivel: GeoFallbackLevel; rotulo: string | null; pais?: string; estado?: string; cidade?: string; raioKm?: number };

  const tentativas: Tentativa[] = [];
  if (temCoordenadas && params.raio) {
    // BUG CORRIGIDO (achado ao vivo pelo usuário): raio escolhido
    // manualmente (botões em AdsSidebar.tsx) usa só esse valor — o
    // usuário já decidiu, não faz sentido a escada automática
    // 100km->300km por cima. Ainda cai pra estado/país/tudo se vier
    // vazio (rede de segurança, mesmo espírito do resto da escada).
    tentativas.push({ nivel: 'radius_close', rotulo: cidade || estado || null, raioKm: params.raio });
  } else if (temCoordenadas) {
    tentativas.push({ nivel: 'radius_close', rotulo: cidade || estado || null, raioKm: RADIUS_CLOSE_KM });
    tentativas.push({ nivel: 'radius_wide', rotulo: `até ${RADIUS_WIDE_KM}km`, raioKm: RADIUS_WIDE_KM });
  } else if (cidade) {
    tentativas.push({ nivel: 'city', rotulo: cidade, pais, estado, cidade });
  }
  if (estado) tentativas.push({ nivel: 'state', rotulo: estado, pais, estado });
  if (pais && pais !== 'todos') tentativas.push({ nivel: 'country', rotulo: pais, pais });
  tentativas.push({ nivel: 'all', rotulo: null });

  const nivelOriginal = tentativas[0].nivel;
  const rotuloOriginal = tentativas[0].rotulo;

  let resultado: Awaited<ReturnType<typeof getAdsListagem>> | null = null;
  let nivelEncontrado: GeoFallbackLevel = 'all';
  let rotuloEncontrado: string | null = null;

  for (const tentativa of tentativas) {
    if (tentativa.nivel === 'radius_close' || tentativa.nivel === 'radius_wide') {
      const sb = await createClient();
      const { data: idsComDistancia, error: rpcError } = await sb.rpc('search_ads_ids_within_radius', {
        p_lat: lat, p_lng: lng, p_radius_km: tentativa.raioKm, p_limit: 300,
      });
      if (rpcError) {
        // Extensão/função pode não existir ainda em algum ambiente (ex.:
        // migration aplicada em produção mas não num preview) — não
        // derruba a página, só pula pro próximo nível da escada.
        logError(rpcError, { context: 'search_ads_ids_within_radius', raioKm: tentativa.raioKm });
        continue;
      }
      const ids = (idsComDistancia || []).map((r: { id: string }) => r.id);
      if (ids.length === 0) continue; // ninguém nesse raio, tenta o próximo nível
      resultado = await getAdsListagem({ ...params, pais: undefined, estado: undefined, cidade: undefined }, {}, ids);
    } else {
      resultado = await getAdsListagem(
        { ...params, pais: tentativa.pais, estado: tentativa.estado, cidade: tentativa.cidade },
        { pais: tentativa.pais, estado: tentativa.estado, cidade: tentativa.cidade }
      );
    }
    nivelEncontrado = tentativa.nivel;
    rotuloEncontrado = tentativa.rotulo;
    if (resultado.total > 0 || tentativa.nivel === 'all') break;
  }

  const geoFallback = (nivelOriginal !== 'all' && nivelEncontrado !== nivelOriginal && resultado && resultado.total > 0 && rotuloOriginal)
    ? { level: nivelEncontrado, fromLabel: rotuloOriginal, toLabel: rotuloEncontrado }
    : null;

  return { ...resultado!, geoFallback };
}
