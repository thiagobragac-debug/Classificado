-- ============================================================================
--  PERFORMANCE: RPCs de valores distintos pra popular os dropdowns de
--  país/estado/cidade, em vez de trazer uma linha por anúncio pro cliente
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  lib/useGeoCascading.ts (usado por AdsBrowser.tsx na /listagem e
--  /categoria/[slug], a página de maior tráfego de filtro) fazia 3 selects
--  client-side na tabela `ads` sem `.limit()`, só pra deduplicar no
--  navegador e popular um <select> com poucas dezenas de opções — o volume
--  de dados transferido crescia linearmente com o total de anúncios ATIVOS
--  que casam o filtro de país/estado, não com o número de opções distintas.
--
--  SOLUÇÃO
--
--  3 funções STABLE (não SECURITY DEFINER — rodam com o privilégio de quem
--  chama, RLS de `ads` continua sendo aplicada normalmente, mesma proteção
--  que já existia antes: "Active ads are viewable by everyone") que fazem
--  o DISTINCT no Postgres e devolvem só os valores. GRANT pra
--  anon/authenticated (mesma exposição que já existia via SELECT direto na
--  tabela, só que agora sem trazer linha por anúncio).
-- ============================================================================

create or replace function public.get_distinct_ad_countries(p_category_id uuid default null)
returns table (country text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select distinct ads.country
    from public.ads
   where ads.country is not null
     and (p_category_id is null or ads.category_id = p_category_id);
$function$;

revoke all on function public.get_distinct_ad_countries(uuid) from public;
grant execute on function public.get_distinct_ad_countries(uuid) to anon, authenticated;

create or replace function public.get_distinct_ad_states(p_country text, p_category_id uuid default null)
returns table (state text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select distinct ads.state
    from public.ads
   where ads.country = p_country
     and ads.state is not null
     and (p_category_id is null or ads.category_id = p_category_id);
$function$;

revoke all on function public.get_distinct_ad_states(text, uuid) from public;
grant execute on function public.get_distinct_ad_states(text, uuid) to anon, authenticated;

create or replace function public.get_distinct_ad_cities(p_country text, p_states text[], p_category_id uuid default null)
returns table (city text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select distinct ads.city
    from public.ads
   where ads.country = p_country
     and ads.state = any(p_states)
     and ads.city is not null
     and (p_category_id is null or ads.category_id = p_category_id);
$function$;

revoke all on function public.get_distinct_ad_cities(text, text[], uuid) from public;
grant execute on function public.get_distinct_ad_cities(text, text[], uuid) to anon, authenticated;
