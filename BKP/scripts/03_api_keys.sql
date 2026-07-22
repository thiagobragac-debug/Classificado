-- ═══════════════════════════════════════════════════════════════
-- Tauze Class — API REST para Parceiros
-- Migration: Tabelas api_keys + api_request_logs
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tabela de API Keys ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_name TEXT NOT NULL,
  email        TEXT NOT NULL,
  api_key      TEXT NOT NULL UNIQUE,
  secret_hash  TEXT NOT NULL,
  permissions  TEXT[] DEFAULT ARRAY['read'],
  rate_limit   INT DEFAULT 100,
  is_active    BOOLEAN DEFAULT true,
  environment  TEXT DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  metadata     JSONB DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ
);

-- Índice para busca rápida por chave
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);

-- Índice para listagem admin
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active, created_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();

-- RLS: apenas admins podem gerenciar
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on api_keys" ON api_keys;
CREATE POLICY "Admin full access on api_keys" ON api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Permitir leitura pela service_role (usado pelo backend)
DROP POLICY IF EXISTS "Service role access on api_keys" ON api_keys;
DROP POLICY IF EXISTS "Service role select on api_keys" ON api_keys;
DROP POLICY IF EXISTS "Owner select own key" ON api_keys;

CREATE POLICY "Service role select on api_keys"
  ON api_keys FOR SELECT
  USING (auth.role() = 'service_role');

-- NOTA: A tabela api_keys NÃO possui coluna user_id.
-- O acesso é exclusivamente por service_role (backend) e admins (via profiles.is_admin).
-- A policy "Owner select own key" foi removida pois referenciava user_id inexistente.
-- Se no futuro api_keys precisar de ownership por usuário, adicionar a coluna user_id antes de criar a policy.

COMMENT ON TABLE api_keys IS 'Chaves de API para parceiros tecnológicos (ERPs, leiloeiras, fintechs)';
COMMENT ON COLUMN api_keys.permissions IS 'Permissões: read, write, delete';
COMMENT ON COLUMN api_keys.rate_limit IS 'Requisições permitidas por minuto';
COMMENT ON COLUMN api_keys.environment IS 'sandbox ou production';
COMMENT ON COLUMN api_keys.metadata IS 'Dados adicionais: tipo de sistema, descrição, etc.';

-- ── 2. Tabela de Logs de Requisições ──────────────────────────
CREATE TABLE IF NOT EXISTS api_request_logs (
  id          BIGSERIAL PRIMARY KEY,
  api_key_id  UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  method      TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  status_code INT NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  duration_ms INT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para análise temporal por parceiro
CREATE INDEX IF NOT EXISTS idx_api_logs_key_time
  ON api_request_logs(api_key_id, created_at DESC);

-- Índice para queries de dashboard (últimas 24h)
CREATE INDEX IF NOT EXISTS idx_api_logs_recent
  ON api_request_logs(created_at DESC)
  WHERE created_at > now() - INTERVAL '7 days';

-- RLS
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read access on api_request_logs" ON api_request_logs;
CREATE POLICY "Admin read access on api_request_logs" ON api_request_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Permitir inserção pelo backend via service_role
DROP POLICY IF EXISTS "Insert access on api_request_logs" ON api_request_logs;
DROP POLICY IF EXISTS "Service role insert logs" ON api_request_logs;

CREATE POLICY "Service role insert logs"
  ON api_request_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE api_request_logs IS 'Logs de requisições da API REST para análise e auditoria';

-- ── 3. RPC: Estatísticas da API (para admin dashboard) ────────
CREATE OR REPLACE FUNCTION get_api_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_keys', (SELECT COUNT(*) FROM api_keys),
    'active_keys', (SELECT COUNT(*) FROM api_keys WHERE is_active = true),
    'requests_24h', (SELECT COUNT(*) FROM api_request_logs WHERE created_at > now() - INTERVAL '24 hours'),
    'requests_7d', (SELECT COUNT(*) FROM api_request_logs WHERE created_at > now() - INTERVAL '7 days'),
    'top_partners', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT ak.partner_name, COUNT(arl.id) as request_count
        FROM api_request_logs arl
        JOIN api_keys ak ON ak.id = arl.api_key_id
        WHERE arl.created_at > now() - INTERVAL '24 hours'
        GROUP BY ak.partner_name
        ORDER BY request_count DESC
        LIMIT 5
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_api_stats() TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ✅ Migration concluída com sucesso
-- ═══════════════════════════════════════════════════════════════
