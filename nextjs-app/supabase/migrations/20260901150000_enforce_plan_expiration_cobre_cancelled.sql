-- ============================================================================
--  BUG CORRIGIDO (achado ao vivo, teste de estresse completo Asaas+Stripe,
--  2026-09-01): enforce_plan_expiration() (corrigida hoje mais cedo em
--  20260901140000) rebaixa profiles/user_secrets corretamente pro Grátis
--  quando o período pago vence, mas o UPDATE de public.subscriptions só
--  atinge linhas com status IN ('active', 'past_due') — excluindo
--  'cancelled', que é EXATAMENTE o status que /api/subscriptions/cancel
--  grava (cancelamento normal, acesso mantido até o fim do período já
--  pago). Resultado: uma assinatura cancelada pelo próprio usuário nunca
--  transiciona pra 'expired' quando o período realmente termina — fica
--  travada em 'cancelled' para sempre, mesmo com profiles/user_secrets já
--  corretamente rebaixados.
--
--  Efeito colateral real, confirmado no código: app/(admin)/admin/
--  assinaturas/page.tsx mostra o botão "Reativar" pra QUALQUER linha com
--  status='cancelled' (nunca some, já que o status nunca sai desse valor
--  sozinho) — mesmo pra uma assinatura cujo período pago acabou há meses.
--  Clicar nele (app/api/admin/subscriptions/reactivate/route.ts) restaura
--  profiles.subscription_status='active' SEM restaurar plan_id/
--  plan_expires_at e sem tocar no gateway (já cancelado/deletado lá pra
--  sempre) — produz um estado inconsistente (usuário "ativo" sem plano
--  nenhum).
--
--  Correção: inclui 'cancelled' no filtro, mesmo padrão de
--  20260901140000. Não é específico do Asaas nem do Stripe — afeta
--  qualquer assinatura cancelada normalmente por qualquer gateway.
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
