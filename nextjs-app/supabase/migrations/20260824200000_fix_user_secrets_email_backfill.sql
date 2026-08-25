-- ACHADO DO TESTE COMPLETO DO SITE (2026-08-24): user_secrets.email está NULL
-- para 100% dos usuários em produção (26/26 verificados) — a coluna "Usuário"
-- de /admin/assinaturas sempre mostra "-" em vez do e-mail do assinante.
--
-- Causa raiz: o trigger handle_new_profile_secret() (recriado em
-- 20260822120200_fix_user_secrets_trigger.sql) dispara AFTER INSERT ON
-- public.profiles e só grava `insert into user_secrets (id) values (new.id)`
-- — profiles não tem coluna email (foi deliberadamente excluída da lista de
-- colunas públicas em 20260824190000), então `new.email` nunca existiu para
-- essa função ler. O e-mail real só existe em auth.users.
--
-- Corrigido: a função (SECURITY DEFINER, já roda com privilégio para ler
-- auth.users) agora busca o e-mail de auth.users pelo id. Backfill cobre
-- todo mundo que já existe.
create or replace function public.handle_new_profile_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_secrets (id, email)
  values (new.id, (select email from auth.users where id = new.id))
  on conflict (id) do update set email = excluded.email where public.user_secrets.email is null;
  return new;
end;
$$;

update public.user_secrets us
   set email = au.email
  from auth.users au
 where us.id = au.id
   and us.email is null;
