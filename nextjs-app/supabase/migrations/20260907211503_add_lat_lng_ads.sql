-- ============================================================================
--  ads.lat / ads.lng — base pra busca por raio em KM
-- ============================================================================
--
--  PROBLEMA
--
--  A busca de anúncios só sabe filtrar por texto exato de city/state/country
--  (ilike). Cidade é uma fronteira administrativa arbitrária — alguém a
--  poucos km fora do limite da cidade não aparece pra quem procura "perto de
--  mim", mesmo estando bem mais perto do que muita coisa "no mesmo estado"
--  (que a cascata de lib/geo-cascade.ts já cobre pro caso de zero resultado,
--  mas não resolve precisão de proximidade real).
--
--  POR QUE SÓ AS COLUNAS AQUI (raio de verdade vem numa migration separada)
--
--  Esta é a metade de baixo risco: colunas nullable, sem extensão nenhuma,
--  sem função nova. A extensão cube/earthdistance + índice GiST + a função
--  de busca por raio ficam numa migration à parte, justamente pra um
--  eventual bloqueio na aplicação de uma não travar a outra.
--
--  NULLABLE DE PROPÓSITO
--
--  Anúncio novo só ganha lat/lng quando o vendedor usa "Usar minha
--  localização" no assistente de anúncio (StepLocation.tsx) — digitar a
--  cidade na mão continua funcionando exatamente como hoje, só sem entrar na
--  busca por raio (cai na busca por texto normal). Nunca bloqueia publicação.
-- ============================================================================

alter table public.ads
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Índice simples (não-GiST) — só acelera consultas óbvias tipo "ads com
-- coordenada preenchida"; o índice espacial de verdade pra raio entra na
-- migration da extensão cube/earthdistance.
create index if not exists ads_lat_lng_idx
  on public.ads (lat, lng)
  where lat is not null and lng is not null;

comment on column public.ads.lat is 'Latitude do anúncio (opcional) — preenchida quando o vendedor usa geolocalização no assistente de anúncio. Usada pela busca por raio em KM.';
comment on column public.ads.lng is 'Longitude do anúncio (opcional) — ver comentário de ads.lat.';
