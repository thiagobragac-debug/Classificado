-- Extensão do monitoramento (achado ao vivo, 27/set/2026): usuário pediu
-- mais indicadores/ações depois do primeiro dashboard (commit d82b64e) --
-- 3 evidências reais já vistas nos logs desta investigação: falha de
-- webhook não persistida em lugar nenhum (só console.warn/error, perdidos
-- quando os logs do Render expiram), Upstash não configurado (rate limit
-- de /login caindo no fallback do Postgres), e conexões do Postgres nunca
-- monitoradas apesar do teto baixo do plano Free (60).

ALTER TABLE public.system_health_samples
  ADD COLUMN IF NOT EXISTS pg_connections_active INTEGER,
  ADD COLUMN IF NOT EXISTS pg_connections_max INTEGER,
  ADD COLUMN IF NOT EXISTS upstash_configured BOOLEAN,
  ADD COLUMN IF NOT EXISTS webhook_failures_24h INTEGER;

-- Falhas de webhook de pagamento -- até agora só existiam como
-- console.warn/console.error em lib/gateways/webhook-handler.ts. Nota:
-- "subscription not found" especificamente PODE ser transitório (corrida
-- benigna com o checkout, resolvida pelo retry automático do gateway) --
-- 1 ocorrência isolada não é pânico, muitas seguidas pro MESMO evento são.
CREATE TABLE IF NOT EXISTS public.webhook_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gateway TEXT NOT NULL,
  event_type TEXT,
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS webhook_failures_created_at_idx
  ON public.webhook_failures (created_at DESC);

ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins leem falhas de webhook"
  ON public.webhook_failures FOR SELECT
  USING (is_admin());

-- RPC pra métricas que não dá pra ler via PostgREST direto (pg_stat_activity/
-- pg_settings são catálogo do sistema, fora do schema public exposto pela
-- API) -- SECURITY DEFINER, só service_role chama (usado pelo monitor
-- externo e pelo botão "Verificar Agora" do admin).
CREATE OR REPLACE FUNCTION public.get_system_health_metrics()
RETURNS TABLE (
  pg_connections_active INTEGER,
  pg_connections_max INTEGER,
  db_size_bytes BIGINT,
  webhook_failures_24h INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*)::INTEGER FROM pg_stat_activity),
    (SELECT setting::INTEGER FROM pg_settings WHERE name = 'max_connections'),
    pg_database_size(current_database()),
    (SELECT count(*)::INTEGER FROM public.webhook_failures WHERE created_at > now() - interval '24 hours');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_system_health_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_health_metrics() TO service_role;
