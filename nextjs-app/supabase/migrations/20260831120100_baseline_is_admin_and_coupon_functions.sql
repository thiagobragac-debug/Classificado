-- BASELINE (auditoria de segurança, 2026-08-31) — não muda comportamento.
--
-- is_admin(), try_apply_coupon() e revert_coupon_usage() nunca tiveram
-- CREATE FUNCTION versionado em nenhuma migration deste repositório (criadas
-- fora do histórico, provavelmente direto no dashboard do Supabase) — ver
-- supabase/ADVISORY_is_admin_baseline.sql e
-- supabase/ADVISORY_coupon_functions_baseline.sql, que já documentavam esse
-- risco de auditabilidade e instruíam capturar a definição real via
-- `pg_get_functiondef()` antes de versionar (nunca reconstruir às cegas —
-- este projeto já teve uma regressão real, migration 20260828130000, causada
-- exatamente por um CREATE OR REPLACE que não repetiu SECURITY DEFINER/
-- search_path da versão anterior).
--
-- Os três corpos abaixo são CÓPIA LITERAL do que `pg_get_functiondef()`
-- devolveu para produção em 2026-08-31 (API de gerenciamento do Supabase,
-- somente leitura) — não uma reconstrução por evidência indireta. Os GRANTs
-- também foram lidos de `information_schema.routine_privileges` antes de
-- serem repetidos aqui, pelo mesmo motivo.
--
-- is_admin(): idêntica em espírito à reconstrução do advisory (EXISTS com
-- is_admin=true vs. o coalesce que o advisory tinha usado), mas não
-- byte-idêntica — por isso esta migration usa o corpo REAL, não o
-- reconstruído, seguindo a própria instrução do advisory ("se forem
-- diferentes, não aplique o arquivo — use a definição real").
--
-- try_apply_coupon()/revert_coupon_usage(): confirmado que NÃO fazem
-- nenhuma checagem de autorização no próprio corpo — a segurança vem 100%
-- do GRANT (só service_role, nunca authenticated/anon/PUBLIC), replicado
-- abaixo exatamente como capturado. Consistente com o que
-- 20260825150400_lock_down_coupons.sql já documentava.

create or replace function public.is_admin()
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_secrets
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$function$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.try_apply_coupon(p_coupon_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_max_uses INT;
  v_usage_count INT;
BEGIN
  -- Select for update to lock the row atomically
  SELECT max_uses, usage_count INTO v_max_uses, v_usage_count
  FROM coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF v_max_uses IS NOT NULL AND v_usage_count >= v_max_uses THEN
    RETURN false;
  END IF;

  UPDATE coupons
  SET usage_count = usage_count + 1
  WHERE id = p_coupon_id;

  RETURN true;
END;
$function$;

revoke all on function public.try_apply_coupon(uuid) from public;
grant execute on function public.try_apply_coupon(uuid) to service_role;

create or replace function public.revert_coupon_usage(p_coupon_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  UPDATE coupons
  SET usage_count = GREATEST(usage_count - 1, 0)
  WHERE id = p_coupon_id;
END;
$function$;

revoke all on function public.revert_coupon_usage(uuid) from public;
grant execute on function public.revert_coupon_usage(uuid) to service_role;
