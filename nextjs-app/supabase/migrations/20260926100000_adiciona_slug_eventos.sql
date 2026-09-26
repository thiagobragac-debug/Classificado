-- Migração de SEO (achado ao vivo via workflow de auditoria de SEO,
-- 2026-09-26): /eventos/[id] ficou de fora da migração UUID->slug que já
-- cobriu ads/profiles/auction_events (20260830100000). Mesma estratégia:
-- slugify(título) + '-' + primeiros 8 chars do UUID (slugify() já existe,
-- criada naquela migration). Slug imutável após criado (só populado no
-- INSERT via trigger, nunca recalculado no UPDATE) — rota pública ainda
-- aceita o UUID antigo como fallback e faz 301 pro slug real (ver
-- app/(public)/eventos/[slug]/page.tsx).

ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE public.eventos
SET slug = public.slugify(title) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.eventos ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS eventos_slug_unique_idx ON public.eventos (slug);

-- BUG EVITADO (achado ao vivo consultando information_schema.column_privileges
-- antes de escrever esta migration): diferente de ads/auction_events, a
-- tabela eventos tem GRANT explícito POR COLUNA pra anon/authenticated
-- (SELECT/INSERT/UPDATE/REFERENCES em cada uma das colunas existentes,
-- não um GRANT de tabela genérico) — uma coluna NOVA não herda esses
-- grants automaticamente. Sem isso, qualquer query que faça
-- eventos(...slug...) falharia inteira com 42501 (mesma classe de bug já
-- documentada pro incidente de profiles.slug/phone_whatsapp), derrubando
-- a listagem/detalhe de eventos pra 100% dos visitantes.
GRANT SELECT, INSERT, UPDATE (slug) ON public.eventos TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_eventos_slug() RETURNS TRIGGER
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

DROP TRIGGER IF EXISTS eventos_set_slug ON public.eventos;
CREATE TRIGGER eventos_set_slug
  BEFORE INSERT ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.set_eventos_slug();
