-- Migration: Performance indexes for API authentication and rate limiting
-- Date: 2026-07-23

-- Index on api_keys(secret_hash) for fast O(log n) token lookup on every request
CREATE INDEX IF NOT EXISTS idx_api_keys_secret_hash
  ON public.api_keys (secret_hash);

-- Index on api_keys(is_active) to quickly filter only active keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active
  ON public.api_keys (is_active)
  WHERE is_active = true;

-- Composite index on api_request_logs(api_key_id, created_at) for sliding window rate limit query:
-- SELECT count(*) WHERE api_key_id = $1 AND created_at >= $2
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_time
  ON public.api_request_logs (api_key_id, created_at DESC);

-- RLS policy: allow service role / anon key to insert logs (needed for fire-and-forget logging)
-- Note: api_request_logs already has RLS enabled per list_tables output
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_request_logs' AND policyname = 'Allow insert for api logging'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Allow insert for api logging"
      ON public.api_request_logs FOR INSERT
      WITH CHECK (true);
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_request_logs' AND policyname = 'Allow select for rate limit'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Allow select for rate limit"
      ON public.api_request_logs FOR SELECT
      USING (true);
    $policy$;
  END IF;
END
$$;
