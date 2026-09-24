-- ============================================================================
--  PERFORMANCE: remove índices 100% duplicados (mesma definição exata)
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Performance Advisor "Duplicate Index",
--  revisão completa pedida pelo usuário, 2026-09-24)
--
--  11 pares de índices com definição BYTE-IDÊNTICA (confirmado via consulta
--  direta a pg_indexes, colada pelo usuário — mesma(s) coluna(s), mesmo
--  método de acesso, sem predicado parcial diferente). Cada índice extra
--  custa espaço em disco e tempo de escrita (todo INSERT/UPDATE precisa
--  manter os dois em sincronia) sem nenhum ganho de leitura — o planner só
--  usa um dos dois de qualquer forma.
--
--  Critério de qual manter: o índice já referenciado por uma migration
--  existente ("oficial"/documentado) fica; o duplicado criado direto no
--  banco sem migration (mesmo padrão de drift visto o resto desta sessão)
--  é removido. idx_ads_category_id, idx_ads_recent_active, ads_fts_idx e
--  idx_ads_title_pt_trgm são criados em 20260722_performance_indexes.sql /
--  20260722194500_add_fts_to_ads.sql; idx_api_request_logs_key_time é
--  criado em 20260723_api_indexes.sql (e documentado em docs/API_KEYS.md).
--  Nos casos sem nenhum dos dois documentado (idx_ads_geo/idx_ads_location
--  e os 5 pares "*_idx"/"*_idx1" de ads_archive, tabela inteira criada
--  fora de migration), mantido o nome mais claro: idx_ads_location (evita
--  confundir com o índice geoespacial real ads_geo_gist_idx) e a variante
--  sem sufixo "1" em ads_archive (o "1" é claramente o duplicado posterior).
-- ============================================================================

drop index if exists public.idx_ads_category;
drop index if exists public.idx_ads_geo;
drop index if exists public.idx_ads_status_created;
drop index if exists public.idx_ads_fts;
drop index if exists public.idx_ads_title_trgm;

drop index if exists public.ads_archive_category_id_idx1;
drop index if exists public.ads_archive_country_state_city_idx1;
drop index if exists public.ads_archive_fts_idx1;
drop index if exists public.ads_archive_status_created_at_idx1;
drop index if exists public.ads_archive_title_pt_idx1;

drop index if exists public.idx_api_logs_key_time;
