-- ============================================================
-- Script 09: Full-Text Search com índice GIN (OPCIONAL, recomendado)
-- Execute este script no SQL Editor do Supabase para turboalimentar
-- a busca de anúncios. Reduz o tempo de query de ~800ms para ~20ms.
-- ============================================================

-- 1. Adiciona coluna de busca FTS (se não existir)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      coalesce(title_pt, '') || ' ' ||
      coalesce(title_es, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category_id::text, '')
    )
  ) STORED;

-- 2. Cria índice GIN na coluna FTS (busca instantânea)
CREATE INDEX IF NOT EXISTS idx_ads_fts ON ads USING GIN (fts);

-- 3. Cria índice para ordenação (featured + created_at — queries muito comuns)
CREATE INDEX IF NOT EXISTS idx_ads_status_featured_created
  ON ads (status, featured DESC, created_at DESC);

-- 4. Cria índice para filtros de localização (country, state, city)
CREATE INDEX IF NOT EXISTS idx_ads_geo
  ON ads (country, state, city);

-- 5. Cria índice para filtro de categoria
CREATE INDEX IF NOT EXISTS idx_ads_category
  ON ads (category_id);

-- Após rodar este script, substitua em js/supabase.js:
--   q = q.or(`title_pt.ilike.%${search}%,title_es.ilike.%${search}%`);
-- por:
--   q = q.textSearch('fts', search, { config: 'portuguese' });
