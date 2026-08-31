-- Migration: Performance indexes for API authentication and rate limiting
-- Date: 2026-07-23
--
-- ============================================================================
--  AVISO (auditoria de segurança, 2026-08-31) — NÃO REEXECUTAR ESTE ARQUIVO
-- ============================================================================
--
--  Este arquivo cria duas policies abertas em public.api_request_logs
--  ("Allow insert for api logging" WITH CHECK (true), "Allow select for rate
--  limit" USING (true)) que auditorias posteriores identificaram como buraco
--  de segurança e DROPARAM (ver 20260830160200_drop_residual_api_request_logs_policy.sql
--  e 20260830170100_close_open_api_request_logs_insert.sql). A tabela hoje é
--  protegida por RLS com policy admin-only (20260824170000) e GRANT revogado
--  de anon/authenticated (20260830200100).
--
--  supabase/migrations não estava sincronizado com o ledger remoto quando
--  esta nota foi escrita: rodar `supabase db push --linked --dry-run` erra
--  com "Remote migration versions not found" para 20260722/20260723/20260724
--  (nomes de arquivo só com data, sem hora) e o PRÓPRIO CLI sugere, por
--  engano, `supabase migration repair --status reverted 20260722 20260723
--  20260724` como correção. NÃO SIGA ESSA SUGESTÃO: reverter esta versão
--  específica faz um `db push` seguinte tentar recriar as duas policies
--  abertas acima. As 3 versões já estão marcadas como aplicadas no ledger de
--  produção (confirmado consultando supabase_migrations.schema_migrations
--  diretamente) — o erro do dry-run é cosmético, não uma pendência real de
--  execução.
-- ============================================================================

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
