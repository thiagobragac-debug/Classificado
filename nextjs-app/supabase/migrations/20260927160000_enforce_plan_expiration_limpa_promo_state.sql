-- ============================================================================
--  BUG BAIXO CORRIGIDO (revisão adversarial, 27/set/2026): enforce_plan_
--  expiration() já transiciona subscriptions pra 'expired' quando o período
--  pago vence (ver 20260901150000), mas não limpava promo_first_cycle_
--  pending/promo_full_price -- deixando dado órfão numa linha 'expired' que
--  nunca mais é lida por lib/gateways/promo-reajuste.ts (o cron/webhook só
--  filtram status IN ('active','past_due')). Inofensivo por si só, mas é
--  higiene de dado inconsistente que uma reativação futura da MESMA linha
--  (hoje não acontece pro caminho 'expired', mas evita depender disso pra
--  sempre) poderia herdar por engano -- mesmo motivo já corrigido nos
--  caminhos de cancelamento (app/api/subscriptions/cancel,
--  app/api/admin/subscriptions/cancel, app/api/checkout/route.ts).
-- ============================================================================

create or replace function public.enforce_plan_expiration(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan text;
  v_expires_at timestamp with time zone;
  v_max_ads integer;
begin
  select us.plan, p.plan_expires_at into v_plan, v_expires_at
  from public.profiles p
  join public.user_secrets us on us.id = p.id
  where p.id = p_user_id;

  if v_plan is not null and v_plan != 'free' and v_expires_at is not null and v_expires_at < now() then
    update public.profiles
    set plan_id = null,
        subscription_status = 'expired',
        plan_expires_at = null
    where id = p_user_id;

    update public.user_secrets
    set plan = 'free',
        plan_id = null
    where id = p_user_id;

    update public.subscriptions
    set status = 'expired',
        promo_first_cycle_pending = false,
        promo_full_price = null,
        updated_at = now()
    where user_id = p_user_id and status in ('active', 'past_due', 'cancelled');

    select max_ads into v_max_ads
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;

    if v_max_ads is not null then
      perform public.schedule_ad_quota_enforcement(p_user_id, v_max_ads);
    end if;
  end if;
end;
$function$;
