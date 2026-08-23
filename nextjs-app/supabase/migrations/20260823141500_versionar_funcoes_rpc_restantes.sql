-- ============================================================================
--  Versionar as 6 funções RPC restantes do checklist (item 11)
-- ============================================================================
--
--  Captura literal do que está em produção hoje, via pg_get_functiondef() pela
--  Management API. NENHUMA mudança de lógica — só fecha a lacuna de "existe em
--  produção mas não tem migration". As duas que TINHAM defeito real
--  (place_bid_atomic, toggle_favorite_atomic) foram corrigidas em migration
--  própria (20260823140000); esta aqui é puro backfill de versionamento.
--
--  get_localized_recent_ads tem DUAS versões (overloads) coexistindo em
--  produção — parâmetros diferentes, uma delas provavelmente é a versão nova
--  e a outra sobrou de uma refatoração anterior sem limpeza. Mantidas as duas
--  como estão; qual delas o app realmente chama depende dos argumentos que
--  lib/supabase-server.ts passa — não investigado a fundo aqui, fora do
--  escopo desta captura.
--
--  get_seller_stats e enforce_plan_expiration também recebem `p_seller_id` /
--  `p_user_id` como parâmetro sem checar contra auth.uid() — mesmo padrão de
--  place_bid_atomic/toggle_favorite_atomic, mas SEM o mesmo risco: a primeira
--  é só leitura pública (dado que qualquer um já vê na página do vendedor); a
--  segunda só ANTECIPA um downgrade que já aconteceria de qualquer forma
--  quando o plano já está vencido — não há como usar para prejudicar uma
--  assinatura ainda válida. Não corrigidas por não terem exploração real
--  associada; registrado aqui para quem revisar depois.
--
--  get_api_daily_stats (citada no checklist) não existe com esse nome — o que
--  existe é get_api_stats(), com formato diferente (totais agregados, não
--  série diária). app/(admin)/admin/api-keys/usage/page.tsx já tem fallback
--  que calcula os dados diários no cliente quando a RPC falha, e cobre
--  corretamente inclusive os totais — confirmado lendo o código. Painel
--  admin, sem tráfego de API real hoje (0 chaves emitidas). Não versionada
--  aqui por não existir; se algum dia for implementada de verdade, precisa
--  ser uma migration nova escrita para o formato que o cliente espera
--  (DayStats[]: day/total/success/errors/avg_ms), não uma renomeação de
--  get_api_stats.
-- ============================================================================

create or replace function public.get_localized_recent_ads(p_city text, p_state text, p_country text, p_limit integer)
 returns table(id uuid, title_pt text, price numeric, currency text, price_unit_pt text, location_text text, city text, state text, country text, images text[], featured boolean, negotiable boolean, category_id text, created_at timestamp with time zone, tags_pt text[], cat_name_pt text, cat_name_es text)
 language sql
 stable security definer
as $function$
  SELECT
    a.id, a.title_pt, a.price, a.currency,
    a.price_unit_pt, a.location_text, a.city, a.state, a.country,
    a.images, a.featured, a.negotiable,
    a.category_id, a.created_at, a.tags_pt,
    c.name_pt, c.name_es
  FROM ads a
  LEFT JOIN categories c ON c.id = a.category_id
  WHERE a.status = 'active'
  ORDER BY
    CASE
      WHEN p_city IS NOT NULL AND unaccent(lower(a.city)) = unaccent(lower(p_city)) THEN 3
      WHEN p_state IS NOT NULL AND unaccent(lower(a.state)) = unaccent(lower(p_state)) THEN 2
      WHEN p_country IS NOT NULL AND unaccent(lower(a.country)) = unaccent(lower(p_country)) THEN 1
      ELSE 0
    END DESC,
    a.created_at DESC
  LIMIT p_limit;
$function$;

create or replace function public.get_localized_recent_ads(p_city text, p_state text, p_country text, p_limit integer default 12, p_offset integer default 0)
 returns setof ads
 language plpgsql
 stable
as $function$
BEGIN
  RETURN QUERY
  SELECT a.*
  FROM ads a
  WHERE a.status = 'active'
  ORDER BY
    CASE
      WHEN p_city IS NOT NULL AND a.city ILIKE p_city THEN 1
      WHEN p_state IS NOT NULL AND a.state ILIKE p_state THEN 2
      WHEN p_country IS NOT NULL AND a.country ILIKE p_country THEN 3
      ELSE 4
    END ASC,
    a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

create or replace function public.get_localized_featured_ads(p_city text, p_state text, p_country text, p_limit integer default 4)
 returns setof ads
 language plpgsql
 stable
as $function$
BEGIN
  RETURN QUERY
  SELECT a.*
  FROM ads a
  WHERE a.featured = true AND a.status = 'active'
  ORDER BY
    CASE
      WHEN p_city IS NOT NULL AND a.city ILIKE p_city THEN 1
      WHEN p_state IS NOT NULL AND a.state ILIKE p_state THEN 2
      WHEN p_country IS NOT NULL AND a.country ILIKE p_country THEN 3
      ELSE 4
    END ASC,
    a.created_at DESC
  LIMIT p_limit;
END;
$function$;

create or replace function public.get_localized_top_sellers(p_city text, p_state text, p_country text, p_limit integer default 4)
 returns table(id uuid, name text, avatar_url text, verified boolean, active_ads bigint)
 language plpgsql
 stable
as $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.avatar_url,
    p.verified,
    count(a.id)::BIGINT AS active_ads
  FROM profiles p
  JOIN ads a ON a.user_id = p.id
  WHERE p.verified = true AND a.status = 'active'
  GROUP BY p.id, p.name, p.avatar_url, p.verified, p.city, p.state, p.country
  ORDER BY
    CASE
      WHEN p_city IS NOT NULL AND p.city ILIKE p_city THEN 1
      WHEN p_state IS NOT NULL AND p.state ILIKE p_state THEN 2
      WHEN p_country IS NOT NULL AND p.country ILIKE p_country THEN 3
      ELSE 4
    END ASC,
    count(a.id) DESC
  LIMIT p_limit;
END;
$function$;

create or replace function public.get_seller_stats(p_seller_id uuid)
 returns table(total_reviews bigint, avg_rating numeric)
 language plpgsql
 security definer
as $function$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint as total_reviews,
    coalesce(avg(rating), 0)::numeric as avg_rating
  FROM seller_reviews
  WHERE seller_id = p_seller_id;
END;
$function$;

create or replace function public.enforce_plan_expiration(p_user_id uuid)
 returns void
 language plpgsql
 security definer
as $function$
DECLARE
  v_plan text;
  v_expires_at timestamp with time zone;
BEGIN
  SELECT plan, plan_expires_at INTO v_plan, v_expires_at
  FROM profiles
  WHERE id = p_user_id;

  IF v_plan != 'free' AND v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    UPDATE profiles
    SET plan = 'free',
        plan_id = NULL,
        subscription_status = 'expired',
        plan_expires_at = NULL
    WHERE id = p_user_id;

    UPDATE user_secrets
    SET plan = 'free'
    WHERE id = p_user_id;

    UPDATE subscriptions
    SET status = 'expired',
        updated_at = now()
    WHERE user_id = p_user_id AND status IN ('active', 'past_due');
  END IF;
END;
$function$;
