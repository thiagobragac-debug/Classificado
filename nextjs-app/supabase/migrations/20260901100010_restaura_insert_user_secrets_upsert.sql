-- ============================================================================
--  user_secrets — restaura policy de INSERT sem reabrir a auto-concessão
-- ============================================================================
--
--  MOTIVO
--
--  20260831130000_correcoes_teste_estresse_31ago.sql removeu a policy
--  "Users can insert their own secrets" (nunca versionada — existia como
--  drift direto no banco) partindo da premissa de que "app nunca insere em
--  user_secrets diretamente — a linha nasce via trigger
--  on_profile_created_secret". Essa premissa ignora como Postgres trata
--  `INSERT ... ON CONFLICT DO UPDATE` sob RLS: mesmo quando a linha já
--  existe e o comando cai no ramo UPDATE por conflito, a policy de INSERT
--  da tabela É avaliada antes da resolução do conflito. Sem nenhuma policy
--  de INSERT, TODO upsert() falha com "new row violates row-level security
--  policy" — não só a criação da linha.
--
--  updateProfile() (lib/supabase.ts) usa upsert() em user_secrets em dois
--  fluxos de usuário real, os dois quebrados por essa migration:
--    1. RegisterForm.tsx, logo após o cadastro (display_name, phone,
--       zip_code, document_number) — reproduzido ao vivo, teste de
--       23054acessando /login?mode=register: 403 "new row violates row-level
--       security policy for table user_secrets", nenhuma conta nova
--       consegue completar o cadastro desde então.
--    2. ProfileTab.tsx, toda vez que um usuário existente edita
--       endereço/telefone/documento no /painel.
--
--  CORREÇÃO
--
--  Restaura a policy de INSERT (auth.uid() = id, mesmo escopo da policy de
--  UPDATE) — mas, diferente da versão não-rastreada que existia antes,
--  fecha o gap real que motivou a remoção: estende o trigger de guarda já
--  usado no UPDATE (20260822120000_user_secrets_privilege_guard.sql) para
--  também rodar BEFORE INSERT, bloqueando qualquer tentativa de já nascer
--  com is_admin/is_blocked/plan/plan_id/stripe_customer_id fora do valor
--  default da coluna — o mesmo caminho de auto-concessão que a migration
--  de 22/08 fechou pro UPDATE, agora fechado pro INSERT também.
-- ============================================================================

create policy "Users can insert their own secrets"
  on public.user_secrets
  for insert
  with check (auth.uid() = id);

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

  if tg_op = 'UPDATE' then
    if new.is_admin           is distinct from old.is_admin
    or new.is_blocked         is distinct from old.is_blocked
    or new.plan               is distinct from old.plan
    or new.plan_id             is distinct from old.plan_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception
        'user_secrets: is_admin, is_blocked, plan, plan_id e stripe_customer_id só podem ser alterados pelo service_role'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- tg_op = 'INSERT': a linha normal nasce via trigger
  -- on_profile_created_secret (SECURITY DEFINER, passa direto pelo ramo
  -- acima). Este ramo só existe pra cobrir o INSERT que upsert() dispara
  -- via ON CONFLICT DO UPDATE quando a linha já existe (ver policy acima) —
  -- bloqueia só quem tentar nascer já com coluna privilegiada fora do
  -- default, sem impedir o upsert legítimo de campos não-privilegiados.
  if coalesce(new.is_admin, false)   is distinct from false
  or coalesce(new.is_blocked, false) is distinct from false
  or coalesce(new.plan, 'free')      is distinct from 'free'
  or new.plan_id is not null
  or new.stripe_customer_id is not null then
    raise exception
      'user_secrets: is_admin, is_blocked, plan, plan_id e stripe_customer_id só podem ser definidos pelo service_role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_user_secrets_privileged_columns on public.user_secrets;

create trigger guard_user_secrets_privileged_columns
  before insert or update on public.user_secrets
  for each row
  execute function public.guard_user_secrets_privileged_columns();
