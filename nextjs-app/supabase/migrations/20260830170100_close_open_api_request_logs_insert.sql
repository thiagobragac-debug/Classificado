-- ============================================================================
--  api_request_logs — policy de INSERT aberta a qualquer requisição
-- ============================================================================
--
--  PROBLEMA (re-auditoria de segurança, 2026-08-30, achado médio)
--
--  20260723_api_indexes.sql criou "Allow insert for api logging" com
--  `WITH CHECK (true)` — qualquer requisição, autenticada ou anônima, pode
--  inserir linhas arbitrárias em api_request_logs (forjar api_key_id,
--  ip_address, endpoint, status_code à vontade). Não vaza dado (é INSERT,
--  não SELECT), mas polui a tabela que alimenta rate limit por chave,
--  dashboard de uso e billing.
--
--  Nenhum código legítimo depende dessa policy: o único INSERT real da
--  aplicação (lib/api-auth.ts logRequest, e a Edge Function
--  notify-expiring-keys) usa o client com service_role, que ignora RLS por
--  completo. Remover a policy não quebra nada.
-- ============================================================================

drop policy if exists "Allow insert for api logging" on public.api_request_logs;
