-- ============================================================================
--  HIGIENE: revoga EXECUTE público/authenticated de funções só-de-trigger
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Security Advisor, revisão completa pedida
--  pelo usuário, 2026-09-24)
--
--  guard_ad_featured(), guard_ad_moderation(), handle_new_profile_secret(),
--  protect_sensitive_profile_fields() e set_profile_kyc_pending() são
--  funções SECURITY DEFINER usadas EXCLUSIVAMENTE como funções de trigger
--  (confirmado via Database > Triggers do painel: cada uma está anexada a
--  um "BEFORE/AFTER ... EXECUTE FUNCTION" em ads/profiles/verification_
--  requests) — mas o linter de segurança do Supabase (splinter) sinalizou
--  as 5 como "callable by anon/authenticated", ou seja, têm EXECUTE
--  concedido a esses papéis sem necessidade real: confirmado via grep no
--  repo inteiro que nenhum componente/rota chama qualquer uma via
--  `.rpc(...)` — só o Postgres as invoca automaticamente ao disparar o
--  trigger correspondente.
--
--  Triggers NÃO precisam do papel que dispara a operação (INSERT/UPDATE)
--  ter EXECUTE na função do trigger — a invocação é feita pelo mecanismo
--  de trigger do próprio Postgres, não por uma chamada de função direta do
--  papel do chamador. Revogar aqui é seguro: os 5 triggers continuam
--  disparando normalmente, só fecha uma superfície de chamada direta via
--  RPC que nunca deveria ter existido (ex.: NEW/OLD não estariam
--  vinculados fora do contexto de trigger, então uma chamada direta
--  provavelmente já falharia — mas não custa fechar de qualquer forma).
--
--  SOLUÇÃO: revoke idempotente (não erra se o grant já não existir).
-- ============================================================================

revoke execute on function public.guard_ad_featured() from anon, authenticated;
revoke execute on function public.guard_ad_moderation() from anon, authenticated;
revoke execute on function public.handle_new_profile_secret() from anon, authenticated;
revoke execute on function public.protect_sensitive_profile_fields() from anon, authenticated;
revoke execute on function public.set_profile_kyc_pending() from anon, authenticated;
