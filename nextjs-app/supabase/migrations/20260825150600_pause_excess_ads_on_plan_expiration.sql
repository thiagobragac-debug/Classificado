-- ============================================================================
--  enforce_plan_expiration agora pausa o excedente de anúncios ativos
-- ============================================================================
--
--  PROBLEMA
--
--  O FAQ de /planos promete: "Meus anúncios somem se eu cancelar? Não...
--  voltam ao limite do plano Grátis (3 ativos). Os demais ficam pausados
--  automaticamente." Mas o corpo real de enforce_plan_expiration (lido por
--  inteiro na revisão de regras de negócio de 2026-08-25) só atualiza
--  profiles/user_secrets/subscriptions — nunca toca na tabela ads. Um
--  usuário Premium com 20 anúncios ativos cujo plano vence continua com os
--  20 ativos pra sempre; enforce_ad_quota só impede NOVAS ativações, não
--  reage a quem já excedeu.
--
--  CORREÇÃO
--
--  Reaproveita a MESMA regra de resolução do plano Grátis já usada em
--  enforce_ad_quota (plano ativo mais barato de preço 0) e pausa os
--  anúncios ativos mais antigos até caber no limite — mantém os mais
--  recentes ativos, que são os mais prováveis de ainda estarem à venda.
--  Só roda quando o downgrade de fato acontece (mesma condição que já
--  existia).
-- ============================================================================

create or replace function public.enforce_plan_expiration(p_user_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_plan text;
  v_expires_at timestamp with time zone;
  v_max_ads integer;
  v_excess_ids uuid[];
begin
  select plan, plan_expires_at into v_plan, v_expires_at
  from profiles
  where id = p_user_id;

  if v_plan != 'free' and v_expires_at is not null and v_expires_at < now() then
    update profiles
    set plan = 'free',
        plan_id = null,
        subscription_status = 'expired',
        plan_expires_at = null
    where id = p_user_id;

    update user_secrets
    set plan = 'free'
    where id = p_user_id;

    update subscriptions
    set status = 'expired',
        updated_at = now()
    where user_id = p_user_id and status in ('active', 'past_due');

    -- Pausa o excedente de anúncios ativos, respeitando a cota do plano
    -- Grátis (fallback: plano ativo mais barato de preço 0, mesma regra de
    -- enforce_ad_quota).
    select max_ads into v_max_ads
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;

    if v_max_ads is not null then
      select array_agg(id) into v_excess_ids
        from (
          select id
            from public.ads
           where user_id = p_user_id
             and status = 'active'::ad_status
           order by created_at asc
           offset v_max_ads
        ) excess;

      if v_excess_ids is not null then
        update public.ads
           set status = 'paused'::ad_status, updated_at = now()
         where id = any(v_excess_ids);
      end if;
    end if;
  end if;
end;
$function$;
