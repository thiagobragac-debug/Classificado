-- ============================================================================
--  Correções da 4ª rodada — reescrita de billing + 2 regressões da própria
--  migration da 3ª rodada, achadas por revisão independente + testes reais
--  no sandbox Stripe
-- ============================================================================

-- 1. guard_ad_moderation: o ramo paused→active (self-service, item 1 da 3ª
--    rodada) SEMPRE falhava em produção. Causa: `fts` é GENERATED ALWAYS AS
--    (...) STORED — o Postgres mantém NEW.fts como NULL durante todo o
--    BEFORE trigger (só calcula depois que todos os BEFORE terminam), então
--    comparar to_jsonb(new)-... contra to_jsonb(old)-... sempre via diferença
--    nesse campo, mesmo sem editar nada. O ramo irmão active→active já
--    excluía 'fts' corretamente; este não excluía.
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active'::public.ad_status then
      raise exception
        'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'active'::public.ad_status and old.status = 'paused'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','status','views_count','search_vector','fts','featured','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','status','views_count','search_vector','fts','featured','expires_at'])
    then
      raise exception
        'ads: reativar e editar ao mesmo tempo requer nova moderacao. Salve a edicao separadamente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'active'::public.ad_status and old.status is distinct from 'active'::public.ad_status then
    raise exception
      'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
      using errcode = '42501';
  end if;

  if old.status = 'active'::public.ad_status and new.status = 'active'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
    then
      raise exception
        'ads: editar anuncio ativo requer nova moderacao. Envie o status para pending.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────

-- 2. protect_sensitive_profile_fields checava auth.role()='service_role' OR
--    is_admin() — SECURITY DEFINER muda current_user, não auth.role() (que
--    continua refletindo o JWT de quem chamou originalmente). Os guardas
--    irmãos (guard_profile_verification, guard_user_secrets_privileged_
--    columns) já sabiam disso e checam current_user in ('service_role',
--    'postgres','supabase_admin') — o comentário da migration anterior já
--    avisava "armadilha real pra código futuro"; enforce_plan_expiration e
--    set_profile_kyc_pending (ambas SECURITY DEFINER, chamadas pela própria
--    sessão do usuário comum) caíram exatamente nela: toda escrita delas em
--    `profiles` era revertida em silêncio por este trigger.
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

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

-- ────────────────────────────────────────────────────────────────────────

-- 3. LOCK REAL de concorrência para o checkout. O lock por checkoutId (PK)
--    só protege reenvio do MESMO checkoutId — duas abas, ou um segundo
--    clique antes do botão desabilitar, geram checkoutIds DIFERENTES e não
--    colidem em lugar nenhum. Confirmado ao vivo, 3x de forma independente:
--    2 assinaturas ativas reais pro mesmo usuário/plano, cupom consumido
--    2x, 2 trocas nativas concorrentes mutando a mesma assinatura Stripe.
--    Um índice único parcial em (user_id) WHERE status='pending' torna
--    "só pode haver 1 tentativa de checkout em voo por usuário" uma
--    garantia atômica do Postgres, não uma checagem em 2 passos (SELECT
--    depois INSERT) que sempre tem uma janela de corrida.
create unique index if not exists subscriptions_user_pending_lock
  on public.subscriptions (user_id)
  where status = 'pending';

-- ────────────────────────────────────────────────────────────────────────

-- 4. Base para corrigir processamento fora de ordem do webhook
--    subscription.plan_changed (achado: dois eventos de troca de plano
--    entregues fora de ordem — a Stripe não garante ordem de entrega —
--    aplicam "o último processado" em vez de "o cronologicamente mais
--    recente", reproduzido de forma determinística). Guarda o timestamp
--    (Unix seconds) do evento Stripe que efetivamente concedeu o
--    entitlement mais recente, pra webhooks/payments/route.ts comparar
--    antes de sobrescrever.
alter table public.subscriptions
  add column if not exists plan_changed_event_created_at bigint;

-- 5. Base para corrigir o mapeamento de invoice.payment_failed, que hoje
--    trata falha de proração (troca de plano) igual falha de renovação
--    normal, marcando profiles.subscription_status='past_due' mesmo com o
--    plano ATUAL do cliente em dia — cosmético (não perde acesso), mas
--    confuso pro admin. lib/gateways/types.ts e stripe.ts passam a expor
--    billingReason no WebhookEvent pra webhooks/payments/route.ts poder
--    diferenciar.
