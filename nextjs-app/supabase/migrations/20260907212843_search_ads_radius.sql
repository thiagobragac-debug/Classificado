-- ============================================================================
--  Busca de anúncios por raio em KM (cube/earthdistance)
-- ============================================================================
--
--  PROBLEMA
--
--  Cidade é hoje o único critério de proximidade (ilike('city', ...)) — uma
--  fronteira administrativa arbitrária. A cascata automática (lib/geo-cascade.ts,
--  ads_service.getAdsListagemComFallbackGeografico) já resolve o caso de zero
--  resultado ampliando pra estado/país, mas não resolve a precisão: alguém a
--  poucos km fora do limite da cidade não aparece, mesmo estando mais perto
--  de verdade do que muita coisa "no mesmo estado".
--
--  POR QUE cube/earthdistance E NÃO PostGIS
--
--  PostGIS é muito mais preciso (elipsoide WGS84, geofencing, rotas), mas é
--  uma extensão pesada pro que este site precisa (só "está dentro de X km").
--  cube/earthdistance dão distância esférica com erro desprezível (~0,3%)
--  pra essa finalidade, com uma superfície de extensão bem menor — mesmo
--  espírito de só habilitar o que é usado de verdade, já seguido neste
--  projeto (ver unaccent/pg_trgm movidos pro schema extensions em
--  20260830191000).
--
--  POR QUE UMA FUNÇÃO SÓ COM ids, NÃO REIMPLEMENTAR TODO O FILTRO EM SQL
--
--  getAdsListagem (lib/services/ads.service.ts) já filtra por categoria,
--  subcategoria, preço, destaque, busca textual, ordenação e paginação.
--  Reimplementar tudo isso aqui duplicaria e divergiria com o tempo. Esta
--  função devolve só (id, distância) de quem está dentro do raio — o
--  chamador combina com `.in('id', ids)` na consulta existente, sem tocar
--  no resto do filtro.
--
--  SECURITY INVOKER (não definer) DE PROPÓSITO
--
--  A função só devolve linhas com status='active' — já coberto pela policy
--  de leitura pública existente em `ads`. Sem motivo pra rodar com
--  privilégio elevado; `status='active'` também é checado explicitamente
--  aqui dentro (defesa em profundidade, mesmo padrão já usado no projeto —
--  ver comentários de IDOR em docs/CHECKLIST-PRODUCAO.md), não só confiar
--  na RLS como único ponto de checagem.
-- ============================================================================

create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- Índice GiST — acelera a pré-filtragem por bounding box (earth_box) que a
-- função abaixo usa antes do cálculo exato de distância.
create index if not exists ads_geo_gist_idx
  on public.ads
  using gist (extensions.ll_to_earth(lat, lng))
  where lat is not null and lng is not null and status = 'active';

create or replace function public.search_ads_ids_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_limit integer default 300
) returns table(id uuid, distance_km double precision)
language sql
stable
-- BUG CORRIGIDO (achado ao vivo pelo usuário: "operator does not exist:
-- extensions.cube @> extensions.earth"): search_path = '' (vazio) impede o
-- Postgres de resolver o operador @> entre cube/earth — chamada de FUNÇÃO
-- (extensions.ll_to_earth, já qualificada abaixo) não depende de search_path
-- nenhum, mas OPERADOR sim (é resolvido pelo search_path da sessão/função,
-- a menos que se use a sintaxe OPERATOR(schema.op) explícita). Mesmo padrão
-- já usado no projeto pra unaccent/pg_trgm (20260830191000): search_path
-- com 'public','extensions', nunca vazio, quando o corpo usa objetos de uma
-- extensão movida pro schema extensions.
set search_path = 'public', 'extensions'
as $$
  select
    a.id,
    extensions.earth_distance(
      extensions.ll_to_earth(p_lat, p_lng),
      extensions.ll_to_earth(a.lat, a.lng)
    ) / 1000.0 as distance_km
  from public.ads a
  where a.status = 'active'
    and a.lat is not null
    and a.lng is not null
    and p_lat is not null
    and p_lng is not null
    and p_radius_km > 0
    -- Pré-filtro rápido (usa o índice GiST acima) antes do cálculo exato.
    and extensions.earth_box(
          extensions.ll_to_earth(p_lat, p_lng),
          p_radius_km * 1000
        ) @> extensions.ll_to_earth(a.lat, a.lng)
    -- Cálculo exato — earth_box é uma caixa (aproximação quadrada), sem
    -- isso os cantos da caixa entrariam mesmo estando fora do raio real.
    and extensions.earth_distance(
          extensions.ll_to_earth(p_lat, p_lng),
          extensions.ll_to_earth(a.lat, a.lng)
        ) <= p_radius_km * 1000
  order by distance_km asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.search_ads_ids_within_radius(double precision, double precision, double precision, integer)
  to anon, authenticated;
