-- ============================================================================
--  Correções de billing (rodada 6, validação do zero): RLS órfã em
--  subscriptions + limpeza da coluna morta profiles.plan
-- ============================================================================
--
--  ACHADO 1 — política de INSERT órfã em public.subscriptions: qualquer
--  usuário autenticado podia inserir uma linha de assinatura pra si mesmo
--  (plan, price, status='active', current_period_end arbitrário) via chamada
--  direta ao PostgREST, contornando toda a lógica/rate-limiting da aplicação.
--  Confirmado que NÃO escala pra entitlement real (profiles/user_secrets são
--  protegidos por trigger e não são tocados por essa política), mas poluía o
--  dashboard de MRR/"Assinaturas ativas" do admin e abria espaço pra fraude
--  de suporte ("olha, eu já paguei"). Todo INSERT real de assinatura no
--  sistema hoje acontece via app/api/checkout/route.ts, que usa o cliente
--  admin/service_role — esse cliente já ignora RLS, então não deveria existir
--  NENHUMA política de INSERT liberada pra usuários comuns nesta tabela.
--
--  ACHADO 2 — profiles.plan é coluna morta: nenhum código TypeScript da
--  aplicação lê ou escreve nela (confirmado via grep). Só é escrita por duas
--  funções SQL:
--    - activate_subscription(p_tx_id, p_payment_id): função inteira já morta
--      (nenhum código chama essa RPC) — pertence à arquitetura de billing
--      antiga baseada na tabela `transactions`, abandonada desde que
--      subscriptions passou a ser a fonte de verdade. Removida só a escrita
--      de `plan` (não a função inteira — fora do escopo deste achado
--      específico, e não custa nada deixar o resto dela como está).
--    - enforce_plan_expiration(p_user_id): função ATIVA (chamada em toda
--      visita a /painel), mas a escrita em profiles.plan é redundante — o
--      mesmo UPDATE já escreve em user_secrets.plan, que é a coluna que
--      TODO o código de leitura realmente usa (lib/supabase.ts,
--      app/(public)/painel/page.tsx, etc.).
--  Removendo a escrita das duas funções primeiro pra poder derrubar a coluna
--  com segurança, sem quebrar nenhuma delas.
-- ============================================================================

-- ACHADO 1: remove a política de INSERT órfã.
drop policy if exists "Users can insert their own subscriptions" on public.subscriptions;

-- ACHADO 2a: activate_subscription — remove a escrita de profiles.plan (dead
-- write, função sem nenhum chamador na aplicação).
create or replace function public.activate_subscription(p_tx_id uuid, p_payment_id text)
 returns uuid
 language plpgsql
as $function$
DECLARE
  v_tx RECORD;
  v_plan RECORD;
  v_plan_slug TEXT;
  v_updated_id UUID;
BEGIN
  -- Atomicity: Lock and update ONLY if not already approved
  UPDATE transactions
  SET status = 'approved', payment_id = p_payment_id
  WHERE id = p_tx_id AND status != 'approved'
  RETURNING * INTO v_tx;

  IF NOT FOUND THEN
    RETURN NULL; -- Já foi processado ou não existe
  END IF;

  IF v_tx.plan_type = 'subscription' AND v_tx.notes IS NOT NULL THEN
    -- Busca o plano
    SELECT * INTO v_plan
    FROM plans
    WHERE id = v_tx.notes::uuid;

    IF v_plan.id IS NOT NULL THEN
      -- Determina o slug do plano com base no nome
      v_plan_slug := LOWER(COALESCE(v_plan.name, v_plan.id::TEXT));
      IF v_plan_slug LIKE '%premium%' THEN
          v_plan_slug := 'premium';
      ELSIF v_plan_slug LIKE '%pro%' THEN
          v_plan_slug := 'pro';
      ELSE
          v_plan_slug := 'basic';
      END IF;

      UPDATE profiles
      SET plan_id = v_plan.id,
          subscription_status = 'active'
      WHERE id = v_tx.user_id;
    END IF;
  ELSIF v_tx.ad_id IS NOT NULL THEN
    UPDATE ads SET featured = true WHERE id = v_tx.ad_id;
  END IF;

  RETURN v_tx.ad_id;
END;
$function$;

-- ACHADO 2b: enforce_plan_expiration — remove a escrita redundante de
-- profiles.plan (user_secrets.plan, escrita logo abaixo, é a fonte de
-- verdade real lida pelo resto da aplicação).
create or replace function public.enforce_plan_expiration(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_plan text;
  v_expires_at timestamp with time zone;
  v_max_ads integer;
  v_excess_ids uuid[];
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

-- ACHADO 2c: com as duas funções já não escrevendo mais nela, a coluna pode
-- ser removida com segurança.
alter table public.profiles drop column if exists plan;
