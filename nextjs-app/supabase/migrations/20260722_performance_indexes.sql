-- Habilitar a extensão pg_trgm para buscas de texto eficientes usando trigramas
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Criar índice GIN em title_pt e title_es para acelerar pesquisas (ILIKE / tsvector equivalente com trigramas)
CREATE INDEX IF NOT EXISTS idx_ads_title_pt_trgm ON ads USING gin (title_pt gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ads_title_es_trgm ON ads USING gin (title_es gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ads_location_text_trgm ON ads USING gin (location_text gin_trgm_ops);

-- Índices B-Tree normais para colunas usadas frequentemente em filtros e ordenação
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_category_id ON ads(category_id);
CREATE INDEX IF NOT EXISTS idx_ads_state ON ads(state);
CREATE INDEX IF NOT EXISTS idx_ads_city ON ads(city);
CREATE INDEX IF NOT EXISTS idx_ads_price ON ads(price);
CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC);

-- Índice composto para a Home Page (Recent Ads que estão ativos)
CREATE INDEX IF NOT EXISTS idx_ads_recent_active ON ads(status, created_at DESC);

-- Índice para acelerar a query da Dashboard do Vendedor (Painel)
CREATE INDEX IF NOT EXISTS idx_ads_user_status ON ads(user_id, status);
