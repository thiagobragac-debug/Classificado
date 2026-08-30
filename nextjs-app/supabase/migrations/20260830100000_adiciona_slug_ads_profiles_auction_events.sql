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
CREATE OR REPLACE FUNCTION public.slugify(input TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(input, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- ─── ads.slug (/anuncio/[slug]) ────────────────────────────────────────────
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE public.ads
SET slug = slugify(title_pt) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.ads ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ads_slug_unique_idx ON public.ads (slug);

CREATE OR REPLACE FUNCTION public.set_ads_slug() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := slugify(NEW.title_pt) || '-' || substr(NEW.id::text, 1, 8);
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

-- BUG evitado: display_name normalmente só é preenchido no onboarding, que
-- roda DEPOIS do INSERT em profiles (trigger de auth.users -> profiles cria
-- a linha só com id/email). coalesce(display_name, name, 'vendedor') cobre
-- os três estágios (recém-criado sem nome, com name mas sem display_name, ou
-- já completo) sem nunca gerar slug NULL.
CREATE OR REPLACE FUNCTION public.set_profiles_slug() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := slugify(coalesce(NEW.display_name, NEW.name, 'vendedor')) || '-' || substr(NEW.id::text, 1, 8);
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

CREATE OR REPLACE FUNCTION public.set_auction_events_slug() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := slugify(NEW.title) || '-' || substr(NEW.id::text, 1, 8);
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
