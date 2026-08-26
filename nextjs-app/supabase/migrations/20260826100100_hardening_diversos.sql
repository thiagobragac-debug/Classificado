-- ============================================================================
--  5 correções menores da validação de 2026-08-26, todas do tipo "fecha uma
--  brecha de permissão/hardening", sem mudar nenhuma regra de negócio
-- ============================================================================

-- 1. enforce_plan_expiration sem search_path travado — inconsistente com
--    o padrão que a própria sessão de 25/08 estabeleceu (toda função
--    SECURITY DEFINER nova daquele dia tem `set search_path = ''`; esta,
--    que só foi ESTENDIDA naquele dia pra também mexer em `ads`, ficou de
--    fora). EXECUTE já é concedido a anon/authenticated (aceito
--    anteriormente — só antecipa um downgrade que aconteceria de
--    qualquer forma), então o risco real aqui é só a ausência do
--    search_path, não o RBAC.
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
  v_excess_ids uuid[];
begin
  select plan, plan_expires_at into v_plan, v_expires_at
  from public.profiles
  where id = p_user_id;

  if v_plan != 'free' and v_expires_at is not null and v_expires_at < now() then
    update public.profiles
    set plan = 'free',
        plan_id = null,
        subscription_status = 'expired',
        plan_expires_at = null
    where id = p_user_id;

    update public.user_secrets
    set plan = 'free'
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
      select array_agg(id) into v_excess_ids
        from (
          select id
            from public.ads
           where user_id = p_user_id
             and status = 'active'::public.ad_status
           order by created_at asc
           offset v_max_ads
        ) excess;

      if v_excess_ids is not null then
        update public.ads
           set status = 'paused'::public.ad_status, updated_at = now()
         where id = any(v_excess_ids);
      end if;
    end if;
  end if;
end;
$function$;

-- 2. advance_scheduled_auctions() chamável por qualquer visitante anônimo
--    — a única função SECURITY DEFINER nova de 25/08 sem o REVOKE que
--    todas as outras (place_bid_atomic, toggle_favorite_atomic,
--    try_apply_coupon, revert_coupon_usage, custom_access_token_hook) já
--    têm. Impacto prático era baixo (só antecipa em até 5 min uma
--    transição que já ia acontecer sozinha), mas quebra um padrão
--    consistente por omissão, não por decisão.
revoke execute on function public.advance_scheduled_auctions() from public, anon, authenticated;

-- 3. RLS de auction_lot_bids/auction_bids permitia INSERT direto
--    bypassando toda a validação de place_lot_bid_atomic/place_bid_atomic
--    (valor mínimo, incremento, status do leilão) — o registro forjado
--    não mexe em current_bid/winner_id (só a RPC atualiza isso), então
--    não dá pra "ganhar" de graça, mas polui o histórico público de
--    lances com valores falsos. Revoga INSERT direto da tabela — as RPCs
--    continuam funcionando normalmente porque são SECURITY DEFINER
--    (rodam com o papel do dono da função, que ignora esse REVOKE).
revoke insert on public.auction_lot_bids from anon, authenticated;
revoke insert on public.auction_bids from anon, authenticated;

-- 4. Trigger legado tr_protect_sensitive_profile_fields (criado fora do
--    histórico de migrations) usava `profiles.is_admin` — a coluna ÓRFÃ
--    que o resto do sistema não usa mais (fonte real é
--    user_secrets.is_admin, via public.is_admin()) — como guarda de
--    autorização. Hoje não é explorável (as colunas sensíveis de
--    profiles não têm GRANT de UPDATE pra authenticated, confirmado via
--    information_schema.column_privileges — a mesma proteção que já
--    protege verified/kyc_status), mas é uma fonte de autorização
--    duplicada e dessincronizada, armadilha real pra código futuro.
--    Corrige pra usar a fonte certa em vez de dropar o trigger (as
--    colunas profiles.plan/plan_id/is_admin ainda têm dado real — 21/14/1
--    linhas — então o DROP COLUMN da migration 20260723072100 fica pra
--    uma decisão separada, não parte desta correção de hardening).
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.is_admin = old.is_admin;
  new.verified = old.verified;
  new.kyc_status = old.kyc_status;
  new.subscription_status = old.subscription_status;
  new.plan = old.plan;
  new.plan_id = old.plan_id;
  new.plan_expires_at = old.plan_expires_at;

  return new;
end;
$$;

-- 5. auction_events.status tinha DEFAULT 'agendado' (português), fora do
--    vocabulário que todo o resto do código usa ('scheduled'/'live'/
--    'closed'/'cancelled'/'draft') — inofensivo hoje porque todo INSERT
--    real passa status explícito, mas uma linha que nascesse sem status
--    ficaria invisível pro cron novo e pros filtros da UI pra sempre,
--    sem erro nenhum.
alter table public.auction_events alter column status set default 'scheduled';
