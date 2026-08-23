-- ============================================================================
--  user_secrets — trava de colunas privilegiadas
-- ============================================================================
--
--  MOTIVO
--
--  A migration 20260723072100_split_user_secrets.sql criou:
--
--    CREATE POLICY "Users can update their own non-critical secrets"
--    ON public.user_secrets FOR UPDATE
--    USING (auth.uid() = id);
--
--  O nome diz "non-critical", mas RLS no Postgres filtra LINHAS, nunca COLUNAS.
--  Na prática qualquer usuário autenticado podia rodar, com a própria anon key:
--
--    update user_secrets set is_admin = true where id = auth.uid();
--
--  ...e cair direto no painel admin — que decide o acesso justamente por
--  user_secrets.is_admin (app/(admin)/layout.tsx). O mesmo caminho permitia
--  se autodesbloquear (is_blocked = false) e se dar plano pago (plan).
--
--  CORREÇÃO
--
--  Trigger BEFORE UPDATE que rejeita alteração das colunas privilegiadas por
--  qualquer papel que não seja o service_role. Optamos por trigger em vez de
--  GRANT por coluna porque updateProfile() usa upsert(): revogar UPDATE da
--  tabela exigiria reemitir GRANTs de INSERT e UPDATE coluna a coluna, com
--  risco alto de quebrar o painel. O trigger é cirúrgico e só dispara quando
--  o valor realmente muda, então updates legítimos de perfil não são afetados.
--
--  Quem legitimamente escreve estas colunas já usa service_role:
--    - app/api/checkout/route.ts          (plan, plan_id)  → createAdminClient()
--    - app/api/webhooks/payments/route.ts (plan, plan_id)  → createAdminClient()
--    - app/api/admin/block-user/route.ts  (is_blocked)     → createAdminClient()
-- ============================================================================

create or replace function public.guard_user_secrets_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- service_role (rotas de API, webhooks, jobs) e superusuários passam direto.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.is_admin           is distinct from old.is_admin
  or new.is_blocked         is distinct from old.is_blocked
  or new.plan               is distinct from old.plan
  or new.plan_id            is distinct from old.plan_id
  or new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception
      'user_secrets: is_admin, is_blocked, plan, plan_id e stripe_customer_id só podem ser alterados pelo service_role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_user_secrets_privileged_columns on public.user_secrets;

create trigger guard_user_secrets_privileged_columns
  before update on public.user_secrets
  for each row
  execute function public.guard_user_secrets_privileged_columns();

-- Nota: não há trigger equivalente para INSERT de propósito. A tabela tem RLS
-- ligada e nenhuma policy de INSERT, então `authenticated` já não consegue
-- inserir. A linha nasce pelo trigger on_profile_created_secret, que roda como
-- SECURITY DEFINER (owner postgres) e portanto passa pela guarda acima.
-- Um trigger de INSERT aqui só criaria risco no caminho ON CONFLICT do
-- upsert() usado em lib/supabase.ts:updateProfile().
