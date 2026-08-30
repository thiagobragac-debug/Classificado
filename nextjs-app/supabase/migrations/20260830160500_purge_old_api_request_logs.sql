-- ============================================================================
--  Retenção indefinida de IP/user-agent em api_request_logs
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança, 2026-08-30, achado baixo)
--
--  Logs de uso da API (ip_address, user_agent, endpoint, status) só eram
--  removidos quando a chave de API era excluída (ON DELETE CASCADE, ver
--  20260825100000). Enquanto a chave existir — e chaves agora têm expiração
--  configurável mas continuam existindo como registro depois de expiradas —
--  os logs se acumulam sem TTL por idade. IP é dado pessoal; vale minimização.
--
--  SOLUÇÃO: purga diária de logs com mais de 180 dias, mesmo padrão de
--  pg_cron já usado no projeto (advance_scheduled_auctions,
--  expire_stale_pending_subscriptions).
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_old_api_request_logs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.api_request_logs
   where created_at < now() - interval '180 days';
end;
$$;

select cron.schedule(
  'purge-old-api-request-logs',
  '0 3 * * *',
  $$select public.purge_old_api_request_logs()$$
);
