-- ============================================================================
--  SEGURANÇA: fecha 4 funções que a correção anterior (20260925100100) não
--  fechou de verdade
-- ============================================================================
--
--  Mesma causa raiz do vazamento de MRR corrigido em 20260925100000:
--  `revoke ... from public` só remove a entrada do pseudo-papel PUBLIC —
--  check_report_rate_limit, enforce_ad_media_plan_limits, enforce_ad_quota
--  e enforce_profile_banner_plan_limit têm EXECUTE concedido DIRETO a
--  anon/authenticated (confirmado: continuam "Public Can Execute" no
--  Security Advisor mesmo depois do Refresh, diferente das outras 5 da
--  mesma migration anterior — guard_ad_featured etc. — que já sumiram).
--
--  Todas são funções-trigger (retorno `trigger`), então nem são chamáveis
--  via RPC de qualquer forma (Postgres recusa fora do contexto de
--  trigger) — o revoke aqui é fechamento de superfície, sem risco de
--  quebrar nenhum trigger (o mecanismo de trigger do Postgres não passa
--  pela checagem de EXECUTE do papel chamador).
-- ============================================================================

revoke all on function public.check_report_rate_limit() from anon, authenticated;
revoke all on function public.enforce_ad_media_plan_limits() from anon, authenticated;
revoke all on function public.enforce_ad_quota() from anon, authenticated;
revoke all on function public.enforce_profile_banner_plan_limit() from anon, authenticated;
