-- ============================================================================
--  SEGURANÇA: corrige REVOKE incompleto de funções-trigger + fecha as que
--  faltaram na varredura anterior desta sessão
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, revisão completa pedida pelo usuário, 2026-09-25)
--
--  A migration 20260924150100_revoga_execute_funcoes_trigger_only.sql (mais
--  cedo nesta mesma sessão) tentou fechar o EXECUTE público de 5 funções só-
--  de-trigger com `revoke execute on function f() from anon, authenticated`.
--  O Security Advisor confirma agora que continuam "Public Can Execute" —
--  a correção não funcionou. Motivo: toda função ganha EXECUTE pra PUBLIC
--  (o pseudo-papel que TODO papel do Postgres herda, incluindo anon/
--  authenticated) por padrão na criação. REVOKE num papel NOMEADO não
--  remove o acesso que ainda vem por PUBLIC — só um REVOKE explícito em
--  PUBLIC fecha de verdade. Faltou essa parte.
--
--  Estendido aqui também pra mais 5 funções-trigger (mesmo padrão: Security
--  Definer, tipo de retorno `trigger`, achadas na mesma varredura do
--  Security Advisor) que nunca tinham sido tratadas: check_report_rate_
--  limit, enforce_ad_media_plan_limits, enforce_ad_quota, enforce_profile_
--  banner_plan_limit, handle_new_user.
--
--  SEGURANÇA da correção: funções com tipo de retorno `trigger` NÃO PODEM
--  ser chamadas via SELECT/RPC de jeito nenhum — o Postgres recusa
--  ("trigger functions can only be called as triggers") independente de
--  EXECUTE. Revogar aqui não muda nenhum comportamento funcional, só fecha
--  a superfície visível no linter/schema cache; os 10 triggers continuam
--  disparando normalmente (o mecanismo de trigger do Postgres não passa
--  pela checagem de EXECUTE do papel chamador).
-- ============================================================================

revoke all on function public.guard_ad_featured() from public;
revoke all on function public.guard_ad_moderation() from public;
revoke all on function public.handle_new_profile_secret() from public;
revoke all on function public.protect_sensitive_profile_fields() from public;
revoke all on function public.set_profile_kyc_pending() from public;

revoke all on function public.check_report_rate_limit() from public;
revoke all on function public.enforce_ad_media_plan_limits() from public;
revoke all on function public.enforce_ad_quota() from public;
revoke all on function public.enforce_profile_banner_plan_limit() from public;
revoke all on function public.handle_new_user() from public;
