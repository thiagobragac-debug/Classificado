-- Add generated FTS (Full Text Search) column for text search in ads table
-- This allows for fast text searching instead of using ilike '%text%'

ALTER TABLE ads 
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title_pt, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(title_es, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(description, '')), 'B')
) STORED;

-- Create GIN index on the FTS column for fast lookups
CREATE INDEX IF NOT EXISTS ads_fts_idx ON ads USING GIN (fts);

-- If you also search by tags, you could include tags array in the tsvector, but this is a good start.
