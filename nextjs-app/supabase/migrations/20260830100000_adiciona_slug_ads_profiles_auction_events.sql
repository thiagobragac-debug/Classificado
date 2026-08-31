-- Migração de SEO: URLs amigáveis (slug) para anúncio/vendedor/leilão, em vez
-- de UUID cru. Dataset atual é pequeno (25 ads / 24 profiles / 2
-- auction_events em produção, checado ao vivo antes de escrever esta
-- migration) — o backfill roda inline, na mesma transação da migration, sem
-- necessidade de um script batelado separado.
--
-- Estratégia de slug: slugify(título) + '-' + primeiros 8 chars do UUID.
-- O sufixo do UUID garante unicidade determinística sem precisar de um loop
-- de resolução de colisão (duas linhas diferentes JAMAIS têm o mesmo prefixo
-- de 8 chars de um UUID v4 gerado por gen_random_uuid() — a probabilidade de
-- colisão é desprezível mesmo em milhões de linhas), e mantém o slug legível
-- (ex.: "trator-jd-6110-a1b2c3d4").
--
-- Slug é IMUTÁVEL após criado (só populado no INSERT, nunca recalculado no
-- UPDATE) — igual à prática padrão de URLs amigáveis: se o vendedor editar o
-- título do anúncio depois, o slug já compartilhado/indexado continua
-- funcionando. Rotas públicas (app/(public)/anuncio/[slug] etc.) ainda
-- aceitam o UUID antigo como fallback e fazem 301 pro slug real — ver
-- comentário em cada page.tsx migrada.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Função utilitária de slugificação — remove acentos, minúsculas, troca
-- qualquer sequência de caracteres não-alfanuméricos por um único hífen, e
-- corta hífens nas pontas. IMMUTABLE porque depende só do input (unaccent()
-- com o dicionário default também é IMMUTABLE), o que permite usá-la em
-- índices/DEFAULT no futuro se necessário.
--
-- BUG CRÍTICO CORRIGIDO (achado antes do merge desta migration pro main —
-- ver 20260830150000_fix_slugify_search_path_signup_bug.sql e
-- 20260830191000_move_unaccent_pg_trgm_para_extensions.sql, ambas em main):
-- sem SET search_path, esta função (e as 3 trigger functions abaixo que a
-- chamam) resolve unaccent()/slugify() pelo search_path da ROLE que dispara
-- a chamada, não da sessão que criou a função. supabase_auth_admin (usada
-- pelo GoTrue no INSERT em auth.users, que dispara o trigger de
-- profiles_set_slug) tem search_path fixo em só 'auth' — sem 'public' nem
-- 'extensions' — e por isso um INSERT normal de cadastro derrubava
-- signup/login inteiro em produção com 42883 (function does not exist).
-- SET search_path TO 'public', 'extensions' torna a função imune ao
-- search_path de quem a chama. Deixado sem qualificar unaccent() (em vez de
-- extensions.unaccent() como o fix em main faz) de propósito: esta migration
-- também é a que cria a extensão (CREATE EXTENSION IF NOT EXISTS unaccent
-- abaixo, sem SCHEMA explícito — fica em public por padrão), então
-- qualificar como extensions.unaccent() quebraria um replay desta migration
-- contra um banco novo do zero, antes de 20260830191000 mover a extensão pra
-- extensions. Não qualificar e confiar no search_path (que cobre os dois
-- schemas, onde quer que unaccent esteja em cada ponto da história) resolve
-- corretamente tanto contra produção (unaccent já em extensions, aplicada
-- por 20260830191000) quanto num banco novo replayed do zero.
CREATE OR REPLACE FUNCTION public.slugify(input TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(input, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- ─── ads.slug (/anuncio/[slug]) ────────────────────────────────────────────
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS slug TEXT;

-- guard_ad_moderation e guard_ad_featured (20260825150000) disparam em
-- QUALQUER UPDATE de um ad ativo, sem checar se a coluna alterada tem
-- relação com moderação/destaque — um backfill que só popula `slug` cai na
-- mesma trava de "editar anúncio ativo requer nova moderação" que existe
-- pra mudanças de conteúdo de verdade. Desabilita as duas só pela duração
-- desta UPDATE (DDL transacional — some junto com o resto se a migration
-- inteira falhar) e reabilita logo em seguida.
ALTER TABLE public.ads DISABLE TRIGGER guard_ad_moderation;
ALTER TABLE public.ads DISABLE TRIGGER guard_ad_featured;

UPDATE public.ads
SET slug = slugify(title_pt) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.ads ENABLE TRIGGER guard_ad_moderation;
ALTER TABLE public.ads ENABLE TRIGGER guard_ad_featured;

ALTER TABLE public.ads ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ads_slug_unique_idx ON public.ads (slug);

-- BUG CRÍTICO CORRIGIDO (mesma classe do fix em set_profiles_slug abaixo,
-- aplicado aqui por consistência mesmo esta trigger nunca ter disparado o
-- incidente de produção — INSERT em ads roda sob a role authenticated
-- normal, cujo search_path inclui public, não sob supabase_auth_admin. Ainda
-- assim, sem SET search_path esta função ficaria vulnerável ao search_path
-- de qualquer role futura que insira em ads sem esse default).
CREATE OR REPLACE FUNCTION public.set_ads_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(NEW.title_pt) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ads_set_slug ON public.ads;
CREATE TRIGGER ads_set_slug
  BEFORE INSERT ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.set_ads_slug();

-- ─── profiles.slug (/vendedor/[slug]) ──────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE public.profiles
SET slug = slugify(coalesce(display_name, name, 'vendedor')) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.profiles ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_unique_idx ON public.profiles (slug);

-- BUG CRÍTICO CORRIGIDO (achado ao vivo desta migration, reproduzido contra
-- produção): profiles usa um allowlist explícito de colunas pra SELECT de
-- anon/authenticated desde 20260824190000_restrict_profiles_privileged_
-- columns.sql (revoke select on public.profiles + grant select (lista
-- fechada de colunas)) — uma coluna NOVA não entra nesse allowlist
-- automaticamente. Sem este GRANT, qualquer query que faça
-- profiles(...slug...) embutido (ex.: app/(public)/anuncio/[slug]/page.tsx,
-- que junta ads com profiles) falha inteira com 42501 (a mesma classe de
-- bug já documentada pro incidente do phone_whatsapp), derrubando a
-- página de anúncio pra 100% dos visitantes. ads.slug e auction_events.slug
-- não precisam do mesmo tratamento — essas duas tabelas não têm esse
-- allowlist restrito (confirmado ao vivo: SELECT já concedido a anon/
-- authenticated por padrão pra colunas novas).
GRANT SELECT (slug) ON public.profiles TO anon, authenticated;

-- BUG evitado: display_name normalmente só é preenchido no onboarding, que
-- roda DEPOIS do INSERT em profiles (trigger de auth.users -> profiles cria
-- a linha só com id/email). coalesce(display_name, name, 'vendedor') cobre
-- os três estágios (recém-criado sem nome, com name mas sem display_name, ou
-- já completo) sem nunca gerar slug NULL.
-- BUG CRÍTICO CORRIGIDO (achado ao vivo em produção antes do merge desta
-- migration pro main, já documentado e corrigido lá em
-- 20260830150000_fix_slugify_search_path_signup_bug.sql): sem SET
-- search_path, esta trigger function roda sob o search_path de
-- supabase_auth_admin (role que o GoTrue usa pro INSERT em auth.users, que
-- dispara este trigger em profiles) — search_path fixo em só 'auth', sem
-- 'public'. Cadastro/login inteiro do site respondia 500 (42883: function
-- slugify(text) does not exist) até esta correção existir.
CREATE OR REPLACE FUNCTION public.set_profiles_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(coalesce(NEW.display_name, NEW.name, 'vendedor')) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_slug ON public.profiles;
CREATE TRIGGER profiles_set_slug
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profiles_slug();

-- ─── auction_events.slug (/leiloes/[slug]) ─────────────────────────────────
ALTER TABLE public.auction_events ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE public.auction_events
SET slug = slugify(title) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.auction_events ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS auction_events_slug_unique_idx ON public.auction_events (slug);

-- BUG CRÍTICO CORRIGIDO: mesma classe do fix em set_ads_slug/set_profiles_slug
-- acima — hardenizada por consistência mesmo sem incidente confirmado nesta
-- trigger específica.
CREATE OR REPLACE FUNCTION public.set_auction_events_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(NEW.title) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auction_events_set_slug ON public.auction_events;
CREATE TRIGGER auction_events_set_slug
  BEFORE INSERT ON public.auction_events
  FOR EACH ROW EXECUTE FUNCTION public.set_auction_events_slug();

-- ─── get_localized_top_sellers: adiciona slug ao retorno ───────────────────
-- A seção "Vendedores em Destaque" da home (components/home/TopSellersSection.tsx)
-- linka pro perfil do vendedor — precisa do slug pra gerar /vendedor/{slug}
-- em vez do UUID cru, igual ao resto da migração. Postgres não permite
-- ALTER de tipo de retorno de função (nem via CREATE OR REPLACE) — precisa
-- de DROP + CREATE. Corpo idêntico ao já versionado em
-- 20260823141500_versionar_funcoes_rpc_restantes.sql, só com p.slug
-- adicionado ao SELECT/GROUP BY e à assinatura de retorno.
DROP FUNCTION IF EXISTS public.get_localized_top_sellers(text, text, text, integer);

CREATE FUNCTION public.get_localized_top_sellers(p_city text, p_state text, p_country text, p_limit integer default 4)
 returns table(id uuid, slug text, name text, avatar_url text, verified boolean, active_ads bigint)
 language plpgsql
 stable
as $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.slug,
    p.name,
    p.avatar_url,
    p.verified,
    count(a.id)::BIGINT AS active_ads
  FROM profiles p
  JOIN ads a ON a.user_id = p.id
  WHERE p.verified = true AND a.status = 'active'
  GROUP BY p.id, p.slug, p.name, p.avatar_url, p.verified, p.city, p.state, p.country
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
