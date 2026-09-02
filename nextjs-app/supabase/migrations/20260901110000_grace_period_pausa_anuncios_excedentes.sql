-- ============================================================================
--  Janela de graça pra pausa de anúncios excedentes (upgrade/downgrade)
-- ============================================================================
--
--  PROBLEMA 1 (achado ao vivo, 2026-09-01): enforce_plan_expiration só cobre
--  o caminho "assinatura expirou/cancelada -> caiu pro Grátis"
--  (20260825150600_pause_excess_ads_on_plan_expiration.sql). A troca NATIVA
--  entre dois planos PAGOS (ex.: Premium -> Produtor PRO, quando o mesmo
--  gateway suporta updateSubscriptionPlan e não há proração) atualiza
--  user_secrets.plan na hora, em app/api/checkout/route.ts, mas nunca chama
--  nenhuma rotina de pausa — e mesmo que chamasse, enforce_plan_expiration
--  está hardcoded pro limite do plano Grátis (`where price = 0`), nunca pro
--  limite do plano pago de destino. Um Premium (ilimitado) com 20 anúncios
--  que troca pra PRO (15) nunca tem os 5 excedentes pausados, nem na hora
--  nem depois.
--
--  PROBLEMA 2 (pedido do usuário, mesma sessão): pausa automática sem aviso
--  prévio é pior prática que a maioria dos marketplaces maduros usa (OLX,
--  Mercado Livre, Facebook Marketplace) — o vendedor deveria poder escolher
--  QUAIS anúncios manter ativos dentro da nova cota, com uma janela de graça,
--  antes de qualquer pausa automática acontecer.
--
--  SOLUÇÃO
--
--  Uma tabela pequena (ad_quota_pending) registra "este usuário precisa
--  reduzir pra N anúncios ativos até esta data". Nada em `ads` é tocado na
--  hora da troca de plano — só quando o prazo vence sem o usuário agir (via
--  cron, mesmo padrão de app/api/internal/expire-stale-subscriptions), o
--  fallback determinístico automático entra: mais antigos pausam primeiro,
--  exatamente o critério que já existia (mais recente tem mais chance de
--  ainda estar à venda de verdade).
--
--  Efeito colateral aceito, e correto: o caminho de expiração de plano
--  (enforce_plan_expiration) deixa de pausar NA HORA — agora agenda a mesma
--  janela de graça. Mais generoso que antes (mais alguns dias de anúncios
--  ativos além do já pago), nunca menos — consistente com a promessa do FAQ
--  ("ficam pausados automaticamente"), só que agora com aviso antes.
-- ============================================================================

create table if not exists public.ad_quota_pending (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_ads integer not null,
  deadline timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.ad_quota_pending enable row level security;

-- Só o próprio usuário lê (pra mostrar o aviso no painel). Nenhuma policy de
-- insert/update/delete: só as funções SECURITY DEFINER abaixo (e o cron, via
-- service_role) escrevem aqui — mesmo padrão de pending_password_recovery.
drop policy if exists "Usuário lê a própria pendência de cota de anúncios" on public.ad_quota_pending;
create policy "Usuário lê a própria pendência de cota de anúncios"
  on public.ad_quota_pending
  for select
  using (auth.uid() = user_id);

create index if not exists ad_quota_pending_deadline_idx
  on public.ad_quota_pending (deadline);

-- ── 1. Agenda (ou cancela) a janela de graça ────────────────────────────────
-- Chamada por enforce_plan_expiration (internamente, mesma transação) e por
-- app/api/checkout/route.ts via RPC (service_role) na troca nativa
-- Premium->PRO. Nunca confia em p_max_ads vindo de client anônimo — os dois
-- chamadores são código de servidor/trigger, nunca o browser diretamente.
create or replace function public.schedule_ad_quota_enforcement(p_user_id uuid, p_max_ads integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer;
begin
  select count(*) into v_active_count
    from public.ads
   where user_id = p_user_id and status = 'active'::public.ad_status;

  if v_active_count > p_max_ads then
    insert into public.ad_quota_pending (user_id, max_ads, deadline)
    values (p_user_id, p_max_ads, now() + interval '7 days')
    on conflict (user_id) do update
      set max_ads = excluded.max_ads,
          -- Reduz o prazo se a cota apertou de novo antes do primeiro vencer,
          -- mas nunca o estica além do já concedido (evita reset infinito de
          -- prazo por trocas repetidas de plano).
          deadline = least(public.ad_quota_pending.deadline, excluded.deadline),
          created_at = public.ad_quota_pending.created_at;
  else
    -- Cota nova comporta os anúncios ativos (ex.: upgrade revertendo um
    -- downgrade pendente) — nenhuma pendência faz sentido.
    delete from public.ad_quota_pending where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.schedule_ad_quota_enforcement(uuid, integer) from public, anon, authenticated;
grant execute on function public.schedule_ad_quota_enforcement(uuid, integer) to service_role;

-- ── 2. O próprio usuário escolhe quais manter ativos ────────────────────────
-- Deriva o usuário de auth.uid() (nunca de parâmetro) — mesmo padrão já
-- aplicado em toda RPC chamada pelo client neste projeto (place_bid_atomic,
-- toggle_favorite_atomic etc.), pra nunca reabrir a classe de IDOR já
-- corrigida nelas.
create or replace function public.apply_ad_quota_grace_selection(p_keep_ad_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_ads integer;
  v_keep_count integer;
  v_owned_count integer;
begin
  select max_ads into v_max_ads
    from public.ad_quota_pending
   where user_id = auth.uid();

  if v_max_ads is null then
    raise exception 'Nenhuma pendência de cota de anúncios para este usuário.'
      using errcode = 'P0001';
  end if;

  v_keep_count := coalesce(array_length(p_keep_ad_ids, 1), 0);
  if v_keep_count > v_max_ads then
    raise exception 'Você selecionou % anúncios, mas seu plano permite apenas %.', v_keep_count, v_max_ads
      using errcode = 'P0001';
  end if;

  -- Confirma que TODOS os ids pertencem ao usuário e estão ativos agora —
  -- nunca confia na lista vinda do client sem checar dono.
  select count(*) into v_owned_count
    from public.ads
   where id = any(p_keep_ad_ids)
     and user_id = auth.uid()
     and status = 'active'::public.ad_status;

  if v_owned_count <> v_keep_count then
    raise exception 'Um ou mais anúncios selecionados não pertencem a você ou não estão ativos.'
      using errcode = 'P0001';
  end if;

  update public.ads
     set status = 'paused'::public.ad_status, updated_at = now()
   where user_id = auth.uid()
     and status = 'active'::public.ad_status
     and not (id = any(p_keep_ad_ids));

  delete from public.ad_quota_pending where user_id = auth.uid();
end;
$$;

revoke all on function public.apply_ad_quota_grace_selection(uuid[]) from public, anon;
grant execute on function public.apply_ad_quota_grace_selection(uuid[]) to authenticated;

-- ── 3. Fallback automático quando o prazo vence sem o usuário agir ─────────
-- Só service_role chama (via rota de cron, mesmo padrão de
-- expire-stale-subscriptions) — varre TODOS os usuários com prazo vencido,
-- não recebe user_id, não é chamável por um usuário comum.
create or replace function public.enforce_ad_quota_deadlines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_excess_ids uuid[];
  v_processed integer := 0;
begin
  for v_row in
    select user_id, max_ads from public.ad_quota_pending where deadline < now()
  loop
    -- BUG CORRIGIDO (achado ao vivo, 2026-09-01): a versão original desta
    -- consulta (herdada de enforce_plan_expiration,
    -- 20260825150600_pause_excess_ads_on_plan_expiration.sql) ordenava
    -- `created_at asc` e aplicava OFFSET v_max_ads — isso pula os mais
    -- ANTIGOS e devolve o RESTANTE (os mais novos) como "excedente", o
    -- oposto do pretendido ("mantém os mais recentes ativos"). Reproduzido
    -- ao vivo: com 15 ativos e max_ads=10, a versão antiga pausava os 5
    -- MAIS NOVOS e mantinha os mais antigos — desde 25/08 em produção,
    -- todo usuário que teve o plano expirado teve os anúncios errados
    -- pausados. `desc` + mesmo OFFSET pula os mais NOVOS (os v_max_ads a
    -- manter) e devolve o restante mais antigo, que é o que deve pausar.
    select array_agg(id) into v_excess_ids
      from (
        select id
          from public.ads
         where user_id = v_row.user_id
           and status = 'active'::public.ad_status
         order by created_at desc
         offset v_row.max_ads
      ) excess;

    if v_excess_ids is not null then
      update public.ads
         set status = 'paused'::public.ad_status, updated_at = now()
       where id = any(v_excess_ids);
    end if;

    delete from public.ad_quota_pending where user_id = v_row.user_id;
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.enforce_ad_quota_deadlines() from public, anon, authenticated;
grant execute on function public.enforce_ad_quota_deadlines() to service_role;

-- ── 4. enforce_plan_expiration passa a AGENDAR em vez de pausar na hora ────
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
      perform public.schedule_ad_quota_enforcement(p_user_id, v_max_ads);
    end if;
  end if;
end;
$function$;
