-- ============================================================
-- Correção adiada da auditoria de 2026-08-30 (item deixado de propósito
-- na migration 20260830190000/190200): mover unaccent/pg_trgm do schema
-- public para o schema extensions ("extension_in_public", WARN do linter).
--
-- Por que foi adiado e por que agora é seguro fazer:
--
-- Mover o schema de uma extensão NÃO invalida objetos que já dependem
-- dela (índices GIN com gin_trgm_ops continuam apontando pro operator
-- class certo internamente por OID, não por nome/schema — confirmado:
-- as 9 tabelas com índice trigram, ver abaixo, não precisam de REINDEX).
-- O risco real é só em código que chama unaccent() SEM qualificar o
-- schema, contando com o search_path pra achar a função.
--
-- Mapeamento feito ANTES de mexer em qualquer coisa (varredura completa
-- de pg_proc em public, com pg_depend excluindo objetos da própria
-- extensão): só 5 funções chamam unaccent() — ads_search_vector_update,
-- get_localized_recent_ads (overload de 4 parâmetros, legado — o
-- realmente usado pelo app, o de 5 parâmetros com p_offset, não chama),
-- resolve_location, search_ads, slugify. Nenhuma função usa operador de
-- trigram (%, <->, similarity()) diretamente — o uso de pg_trgm é só via
-- índice, então mover o schema da extensão pg_trgm não tem NENHUM ponto
-- de código pra corrigir, só os índices (que já ficam bons de graça).
--
-- Índices GIN trigram existentes (confirmados intactos após o move):
--   idx_ads_title_trgm, idx_ads_title_pt_trgm, idx_ads_title_es_trgm,
--   idx_ads_location_text_trgm, idx_cidades_nome_trgm,
--   ads_archive_title_pt_idx(1), ads_archive_title_es_idx,
--   ads_archive_location_text_idx
--
-- Correção aplicada com o MESMO padrão já usado (e comprovado ao vivo)
-- no incidente real de 2026-08-30 (20260830150000_fix_slugify_search_
-- path_signup_bug.sql): quando cadastro/login do site inteiro quebrou
-- porque supabase_auth_admin (role real usada pelo GoTrue no INSERT em
-- auth.users, que dispara o trigger de profiles) tem search_path fixo
-- SÓ em 'auth' — nem 'public' entra. A correção que funcionou lá foi
-- qualificar o schema explicitamente na chamada (public.slugify), não
-- só confiar em SET search_path na função. Aqui: as 5 funções passam a
-- chamar extensions.unaccent(...) explicitamente (não depende de
-- search_path de jeito nenhum, nem do da função nem do da role
-- chamadora) E, por cima, o search_path de cada uma ganha 'extensions'
-- como camada extra de segurança.
-- ============================================================

begin;

-- ─── 1) Move as extensões ──────────────────────────────────
alter extension unaccent set schema extensions;
alter extension pg_trgm set schema extensions;

-- ─── 2) slugify: usada por triggers de profiles/ads/auction_events ──
create or replace function public.slugify(input text)
 returns text
 language sql
 immutable
 set search_path to 'public', 'extensions'
as $function$
  select trim(both '-' from regexp_replace(
    lower(extensions.unaccent(coalesce(input, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
$function$;

-- ─── 3) ads_search_vector_update: trigger de busca full-text em ads ──
create or replace function public.ads_search_vector_update()
 returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
begin
  new.search_vector :=
    setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(new.title_pt, ''))), 'A') ||
    setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(new.description, ''))), 'B') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(new.city, '') || ' ' || coalesce(new.state, '') || ' ' || coalesce(new.country, ''))), 'C') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(new.category_id, ''))), 'A');
  return new;
end;
$function$;

-- ─── 4) resolve_location: autocomplete de país/estado/cidade ──
create or replace function public.resolve_location(p_country text default null::text, p_state text default null::text, p_city text default null::text)
 returns json
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  v_pais   record;
  v_estado record;
  v_cidade record;
begin
  if p_country is null or p_country = '' then
    return json_build_object('found', false);
  end if;

  select id, nome, sigla into v_pais from paises
  where extensions.unaccent(lower(nome)) ilike extensions.unaccent(lower(p_country))
  limit 1;

  if v_pais.id is null then
    return json_build_object('found', false);
  end if;

  if p_state is not null and p_state <> '' then
    select id, nome, sigla into v_estado from estados
    where pais_id = v_pais.id
      and (extensions.unaccent(lower(nome)) ilike extensions.unaccent(lower(p_state))
           or upper(sigla) = upper(p_state))
    limit 1;
  end if;

  if p_city is not null and p_city <> '' and v_estado.id is not null then
    select id, nome into v_cidade from cidades
    where estado_id = v_estado.id
      and extensions.unaccent(lower(nome)) ilike extensions.unaccent(lower(p_city))
    limit 1;
  end if;

  return json_build_object(
    'found',       true,
    'pais_id',     v_pais.id,
    'pais_nome',   v_pais.nome,
    'pais_sigla',  v_pais.sigla,
    'estado_id',   v_estado.id,
    'estado_nome', v_estado.nome,
    'estado_sigla',v_estado.sigla,
    'cidade_id',   v_cidade.id,
    'cidade_nome', v_cidade.nome
  );
end;
$function$;

-- ─── 5) get_localized_recent_ads (overload de 4 parâmetros — legado,
-- não usado pelo app hoje, ver lib/supabase.ts e lib/supabase-server.ts
-- que só chamam o de 5 com p_offset; corrigido por completude) ──
create or replace function public.get_localized_recent_ads(p_city text, p_state text, p_country text, p_limit integer)
 returns table(id uuid, title_pt text, price numeric, currency text, price_unit_pt text, location_text text, city text, state text, country text, images text[], featured boolean, negotiable boolean, category_id text, created_at timestamp with time zone, tags_pt text[], cat_name_pt text, cat_name_es text)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  select
    a.id, a.title_pt, a.price, a.currency,
    a.price_unit_pt, a.location_text, a.city, a.state, a.country,
    a.images, a.featured, a.negotiable,
    a.category_id, a.created_at, a.tags_pt,
    c.name_pt, c.name_es
  from ads a
  left join categories c on c.id = a.category_id
  where a.status = 'active'
  order by
    case
      when p_city is not null and extensions.unaccent(lower(a.city)) = extensions.unaccent(lower(p_city)) then 3
      when p_state is not null and extensions.unaccent(lower(a.state)) = extensions.unaccent(lower(p_state)) then 2
      when p_country is not null and extensions.unaccent(lower(a.country)) = extensions.unaccent(lower(p_country)) then 1
      else 0
    end desc,
    a.created_at desc
  limit p_limit;
$function$;

-- ─── 6) search_ads: RPC principal de busca (usada pela home/listagem) ──
create or replace function public.search_ads(p_query text default null::text, p_category text default null::text, p_country text default null::text, p_state text default null::text, p_city text default null::text, p_price_min numeric default null::numeric, p_price_max numeric default null::numeric, p_featured boolean default null::boolean, p_cursor_created_at timestamp with time zone default null::timestamp with time zone, p_cursor_id uuid default null::uuid, p_limit integer default 21)
 returns table(id uuid, title_pt text, description text, price numeric, currency text, category_id text, country text, state text, city text, location_text text, images text[], status text, featured boolean, views_count integer, created_at timestamp with time zone, user_id uuid, seller_name text, seller_verified boolean, rank real)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  select
    a.id, a.title_pt, a.description, a.price, a.currency,
    a.category_id, a.country, a.state, a.city, a.location_text, a.images,
    a.status::text, a.featured, a.views_count,
    a.created_at, a.user_id,
    p.name    as seller_name,
    p.verified as seller_verified,
    case when p_query is not null and p_query <> ''
      then ts_rank(a.search_vector, websearch_to_tsquery('portuguese', extensions.unaccent(p_query)))
      else 0
    end as rank
  from ads a
  left join profiles p on p.id = a.user_id
  where
    a.status = 'active'
    and (p_query is null or p_query = '' or
         a.search_vector @@ websearch_to_tsquery('portuguese', extensions.unaccent(p_query)) or
         a.title_pt ilike '%' || p_query || '%')
    and (p_category is null or a.category_id = p_category)
    and (p_country is null or extensions.unaccent(lower(a.country)) ilike extensions.unaccent(lower(p_country)))
    and (
      p_state is null or
      extensions.unaccent(lower(a.state)) ilike extensions.unaccent(lower(p_state)) or
      exists (
        select 1 from estados e
        where e.sigla = upper(a.state)
          and extensions.unaccent(lower(e.nome)) ilike extensions.unaccent(lower(p_state))
      )
    )
    and (p_city is null or extensions.unaccent(lower(a.city)) ilike extensions.unaccent(lower(p_city)))
    and (p_price_min is null or a.price >= p_price_min)
    and (p_price_max is null or a.price <= p_price_max)
    and (p_featured is null or a.featured = p_featured)
    and (p_cursor_created_at is null or p_cursor_id is null or
         (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
  order by
    case when p_query is not null and p_query <> ''
      then ts_rank(a.search_vector, websearch_to_tsquery('portuguese', extensions.unaccent(p_query)))
      else 0
    end desc,
    a.featured desc,
    a.created_at desc,
    a.id desc
  limit p_limit;
$function$;

commit;
