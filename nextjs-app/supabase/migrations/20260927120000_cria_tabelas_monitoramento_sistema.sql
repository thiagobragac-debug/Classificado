-- Monitoramento de saúde do sistema (achado ao vivo, 26-27/set/2026): 3
-- crashes de OOM no Render em ~36h (Web Service no plano Free, 512MB RAM)
-- levaram a criar um monitor externo (scripts/monitor-render-supabase.mjs,
-- roda a cada hora via tarefa agendada) que agora também PERSISTE o que
-- encontra, pra alimentar um dashboard em /admin/monitoramento -- antes
-- disso, cada checagem só existia como notificação pontual, sem histórico
-- consultável.

-- Amostras periódicas de memória/uptime do PRÓPRIO processo Next.js (via
-- GET /api/health, que agora devolve process.memoryUsage()/process.uptime())
-- + tamanho do banco no momento da amostra. Existe porque o Render bloqueia
-- o gráfico oficial de memória/CPU atrás de um plano pago (confirmado ao
-- vivo no dashboard) -- esta é a forma gratuita de ter um gráfico real.
CREATE TABLE IF NOT EXISTS public.system_health_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rss_bytes BIGINT NOT NULL,
  heap_used_bytes BIGINT NOT NULL,
  heap_total_bytes BIGINT NOT NULL,
  uptime_seconds INTEGER NOT NULL,
  db_size_bytes BIGINT,
  source TEXT NOT NULL DEFAULT 'monitor-render-supabase'
);

CREATE INDEX IF NOT EXISTS system_health_samples_created_at_idx
  ON public.system_health_samples (created_at DESC);

-- Eventos do Render (deploys, crashes) que o monitor descobre via API --
-- render_event_id evita duplicar o mesmo evento se o monitor rodar de novo
-- antes do estado local (scripts/tmp-monitor-state.json) avançar.
CREATE TABLE IF NOT EXISTS public.render_events_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS render_events_log_occurred_at_idx
  ON public.render_events_log (occurred_at DESC);

ALTER TABLE public.system_health_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_events_log ENABLE ROW LEVEL SECURITY;

-- Só admin lê (mesmo padrão de admin_audit_log, migration
-- 20260925232000) -- nenhuma policy de INSERT/UPDATE/DELETE pra
-- anon/authenticated: quem escreve é o monitor externo, usando a
-- service-role key (bypassa RLS por padrão), nunca o client do navegador.
CREATE POLICY "Admins leem amostras de saude do sistema"
  ON public.system_health_samples FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins leem eventos do Render"
  ON public.render_events_log FOR SELECT
  USING (is_admin());
