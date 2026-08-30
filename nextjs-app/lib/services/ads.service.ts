import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { logError } from '@/lib/monitoring';

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
  categoria: z.union([z.string(), z.array(z.string())]).transform(val => Array.isArray(val) ? val[0] : val).optional(),
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

export async function getAdsListagem(params: AdsSearchParams, geoContext: any) {
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

  // Filtros geográficos e de categoria
  if (params.categoria) q = q.eq('category_id', params.categoria);
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
