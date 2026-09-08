-- BUG CORRIGIDO (auditoria de SEO, 2026-09-08): coalesce(display_name, name,
-- 'vendedor') só cai no fallback 'vendedor' quando os dois campos são NULL —
-- quando qualquer um deles é uma STRING VAZIA ('', não NULL), coalesce()
-- devolve a string vazia mesmo assim, e slugify('') = ''. Resultado: o slug
-- final vira só "-{8 chars do id}" (hífen solto na frente, sem nome nenhum).
--
-- Confirmado ao vivo em produção: 53 perfis com esse exato padrão de slug
-- (ex.: "-df8dddeb" em vez de "estancia-rio-passo-fundo-df8dddeb"), a maioria
-- linhas de seed/demo cujo INSERT passou display_name/name como '' em vez de
-- NULL. Os 53 já foram corrigidos manualmente via UPDATE direto nesta sessão
-- (slugs são imutáveis por design — só o trigger de INSERT gerava o valor
-- errado; linhas existentes não se autocorrigem sozinhas). Esta migration
-- corrige só a CAUSA RAIZ na trigger function, pra nenhum cadastro futuro
-- com nome em branco reproduzir o mesmo bug.
--
-- NULLIF(trim(x), '') converte string vazia (ou só espaços) em NULL antes do
-- coalesce — assim NULL, '' e '   ' caem igualmente no fallback 'vendedor'.
CREATE OR REPLACE FUNCTION public.set_profiles_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(
      coalesce(NULLIF(trim(NEW.display_name), ''), NULLIF(trim(NEW.name), ''), 'vendedor')
    ) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

-- Mesma classe de bug, hardenizada por consistência (sem incidente confirmado
-- nestas duas — título de anúncio/leilão é obrigatório no formulário — mas
-- nada impede um INSERT direto via API/seed passar título em branco).
CREATE OR REPLACE FUNCTION public.set_ads_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(coalesce(NULLIF(trim(NEW.title_pt), ''), 'anuncio')) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_auction_events_slug() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(coalesce(NULLIF(trim(NEW.title), ''), 'leilao')) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;
