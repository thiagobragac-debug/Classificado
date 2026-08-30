-- ============================================================================
--  Subcategorias vinculadas a categoria (fluxo completo cadastro->anuncio->filtro)
-- ============================================================================
--
--  Nova tabela `subcategories`, uma linha por subcategoria, sempre vinculada a
--  uma `categories.id` existente. Segue o MESMO padrão já usado em
--  `categories` (id text/slug, name_pt/name_es, active, sort_order) e o mesmo
--  modelo de RLS: leitura pública liberada (o app filtra active=true nas
--  telas públicas, exatamente como já faz para `categories`), escrita
--  restrita a admin via is_admin() (mesma função já usada em
--  20260824180000_security_fix_public_data_exposure.sql).
--
--  `ads.subcategory_id` é uma coluna NOVA, NULLABLE — anúncios já publicados
--  continuam válidos sem subcategoria (decisão de produto confirmada). A FK
--  usa ON DELETE NO ACTION (mesmo comportamento de ads.category_id: o
--  Postgres recusa excluir uma subcategoria com anúncios vinculados; o admin
--  trata esse erro — código 23503 — com mensagem amigável).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subcategories (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES public.categories(id),
  name_pt text NOT NULL,
  name_es text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON public.subcategories(category_id);

ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS subcategory_id text REFERENCES public.subcategories(id);
CREATE INDEX IF NOT EXISTS idx_ads_subcategory_id ON public.ads(subcategory_id);

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica de subcategorias" ON public.subcategories;
CREATE POLICY "Leitura publica de subcategorias" ON public.subcategories
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins gerenciam subcategorias" ON public.subcategories;
CREATE POLICY "Admins gerenciam subcategorias" ON public.subcategories
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
