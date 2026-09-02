-- ============================================================================
--  BUG CRÍTICO CORRIGIDO (achado ao vivo, teste de validação completa do
--  Stripe, 2026-09-01): enforce_plan_expiration() estava quebrada em 100%
--  das chamadas desde a migration 20260901110000
--  (grace_period_pausa_anuncios_excedentes.sql) — regressão real, não
--  hipotética.
-- ============================================================================
--
--  A versão introduzida em 20260901110000 fazia
--  `select plan, plan_expires_at into ... from public.profiles`, lendo a
--  coluna `plan` direto de `profiles`. Essa coluna foi DELIBERADAMENTE
--  DROPADA 5 dias antes, em 20260827150000_rls_subscriptions_e_limpeza_
--  profiles_plan.sql (coluna morta, fonte de verdade real é
--  user_secrets.plan) — migration que, coincidência cruel, continha a
--  versão CORRETA desta mesma função, com join em user_secrets. A reescrita
--  de 20260901110000 (motivada só por adicionar a chamada de
--  schedule_ad_quota_enforcement no fim) reintroduziu exatamente o bug que
--  já tinha sido corrigido, sem querer.
--
--  Toda chamada — inclusive a real, em toda visita a /painel
--  (app/(public)/painel/page.tsx linha 32) — falhava com
--  `42703: column "plan" does not exist`. Esse erro nunca era checado ali
--  (sem try/catch, sem olhar o campo `error` do retorno do rpc()), então
--  falhava em silêncio: a página carregava normalmente e NENHUM usuário
--  era rebaixado pro plano Grátis quando o período pago vencia. Confirmado
--  ao vivo, reproduzido de forma determinística (não é condição de
--  corrida) tanto com o token do próprio usuário quanto com service_role.
--
--  Efeito real em produção: qualquer assinante que cancelasse ou cujo
--  pagamento de renovação falhasse mantinha acesso PRO/Premium para
--  sempre, mesmo sem nunca mais pagar — o `enforce_plan_expiration` era
--  a ÚNICA rede de segurança para esse cenário (webhooks de gateway podem
--  falhar/atrasar, e a decisão de produto já é não revogar acesso na hora
--  do cancelamento, só no fim do período pago).
--
--  CORREÇÃO: restaura o join com user_secrets (fonte real de `plan`) da
--  versão de 20260827150000, e adiciona `plan_id = null` no UPDATE de
--  user_secrets (a versão antiga também não fazia isso — sem isso,
--  user_secrets.plan_id continuava apontando pro plano pago antigo mesmo
--  com plan='free', mesma inconsistência que o downgrade nativo em
--  app/api/checkout/route.ts já evita fazendo os dois campos juntos).
--  Mantém a chamada a schedule_ad_quota_enforcement (grace period de 7
--  dias) introduzida em 20260901110000 — só a leitura/escrita das colunas
--  erradas estava quebrada, o comportamento de grace period em si é
--  correto e não deve ser revertido.
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
    where user_id = p_user_id and status in ('active', 'past_due');

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
