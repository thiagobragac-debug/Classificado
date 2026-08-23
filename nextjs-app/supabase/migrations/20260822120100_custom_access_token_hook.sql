-- ============================================================================
--  Custom Access Token Hook — injeta is_blocked no JWT
-- ============================================================================
--
--  MOTIVO
--
--  proxy.ts checava bloqueio com um SELECT em user_secrets a CADA requisição
--  de usuário logado. Com a flag dentro do próprio access token, a checagem
--  passa a custar zero ida ao banco.
--
--  ATIVAÇÃO (passo manual — não dá para fazer por migration)
--
--    Supabase Dashboard → Authentication → Hooks → Customize Access Token (JWT)
--    Selecionar: public.custom_access_token_hook
--
--  Enquanto o hook não estiver ativo o claim simplesmente não aparece, e o
--  proxy cai no SELECT de antes. É seguro aplicar esta migration antes de
--  ligar o hook, e seguro ligar o hook antes de subir o código novo.
--
--  LIMITE CONHECIDO
--
--  O JWT é stateless: bloquear alguém só surte efeito no proxy quando o token
--  for renovado (padrão: 1 h). Por isso /api/admin/block-user revoga as sessões
--  do usuário junto com a escrita da flag — o refresh token morre na hora e o
--  access token restante expira em minutos, não em uma hora, se o tempo de
--  vida do token estiver reduzido em Authentication → Sessions.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims  jsonb;
  blocked boolean;
begin
  select us.is_blocked
    into blocked
    from public.user_secrets us
   where us.id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{is_blocked}', to_jsonb(coalesce(blocked, false)));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- O hook é executado pelo papel supabase_auth_admin, que precisa enxergar a
-- função e a tabela. Nenhum GRANT existente é revogado aqui: o app continua
-- lendo user_secrets como `authenticated`, sob as policies já existentes.
grant usage  on schema public                              to supabase_auth_admin;
grant execute on function public.custom_access_token_hook  to supabase_auth_admin;
grant select  on table public.user_secrets                 to supabase_auth_admin;

-- A função não pode ser chamada por quem se autentica no app.
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- user_secrets tem RLS: sem esta policy o SELECT acima volta vazio e todo
-- mundo seria tratado como não-bloqueado.
drop policy if exists "auth_admin_can_read_user_secrets" on public.user_secrets;
create policy "auth_admin_can_read_user_secrets"
  on public.user_secrets
  as permissive for select
  to supabase_auth_admin
  using (true);
