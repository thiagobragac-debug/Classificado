-- ============================================================================
--  PERFORMANCE: RPC de contagem de anúncios por subcategoria (GROUP BY no
--  Postgres em vez de trazer uma linha por anúncio pro cliente contar)
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  components/ads/AdsBrowser.tsx buscava `subcategory_id` de TODOS os
--  anúncios ativos de uma categoria, sem limit, só pra contar a
--  distribuição no cliente (soma um objeto por linha recebida). Uma
--  categoria popular com milhares de anúncios ativos transferia uma linha
--  por anúncio pro navegador só pra produzir um objeto de poucas dezenas de
--  contagens.
--
--  SOLUÇÃO
--
--  Mesmo padrão de get_distinct_ad_countries/states/cities (20260924140000):
--  SECURITY INVOKER, RLS de `ads` continua se aplicando normalmente.
--
--  BUG CORRIGIDO (mesmo achado de 20260924140000, aplicado aqui também):
--  category_id/subcategory_id são `text` no schema real (ver
--  20260828150000_cria_subcategorias.sql:22,31), não `uuid`.
-- ============================================================================

create or replace function public.get_subcategory_counts(p_category_id text)
returns table (subcategory_id text, ad_count bigint)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select ads.subcategory_id, count(*)
    from public.ads
   where ads.category_id = p_category_id
     and ads.status = 'active'
     and ads.subcategory_id is not null
   group by ads.subcategory_id;
$function$;

revoke all on function public.get_subcategory_counts(text) from public;
grant execute on function public.get_subcategory_counts(text) to anon, authenticated;
