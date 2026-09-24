-- ============================================================================
--  PERFORMANCE: índice trigram (GIN) pra ILIKE em ads.city/state/country
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  lib/services/ads.service.ts::getAdsListagem filtra city/state/country
--  com `.ilike()`, mas os únicos índices existentes nessas colunas são
--  B-tree simples (idx_ads_state/idx_ads_city, 20260722_performance_
--  indexes.sql) ou inexistentes (country) — nenhum funciona pra ILIKE, que
--  não é sargável contra B-tree comum (comparação case-sensitive). O
--  filtro de cidade em especial roda automaticamente em quase toda visita
--  orgânica à /listagem (getAdsListagemComFallbackGeografico usa a cidade
--  detectada por IP como filtro padrão), forçando Seq Scan completo na
--  tabela `ads` a cada aumento de volume.
--
--  SOLUÇÃO
--
--  Mesmo padrão já usado pra title_pt/title_es/location_text
--  (20260722_performance_indexes.sql) — índice GIN trigram via pg_trgm
--  (extensão já habilitada, movida pro schema `extensions` em
--  20260830191000, mas o search_path padrão do Supabase já inclui esse
--  schema, mesma convenção da migration original que não qualifica
--  gin_trgm_ops).
-- ============================================================================

create index if not exists idx_ads_city_trgm    on public.ads using gin (city gin_trgm_ops);
create index if not exists idx_ads_state_trgm   on public.ads using gin (state gin_trgm_ops);
create index if not exists idx_ads_country_trgm on public.ads using gin (country gin_trgm_ops);
