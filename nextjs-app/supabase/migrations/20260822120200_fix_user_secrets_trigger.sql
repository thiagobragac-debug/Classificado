-- ============================================================================
--  Recria o trigger que cria a linha em user_secrets junto com o profile
-- ============================================================================
--
--  DIAGNÓSTICO (2026-08-22, contra o banco de produção)
--
--  Criando um usuário pelo Auth e observando o resultado:
--
--    profiles criada por trigger      -> SIM
--    user_secrets criada por trigger  -> NAO
--
--  O trigger `on_profile_created_secret` consta em
--  20260723072100_split_user_secrets.sql, mas não está ativo no banco. A causa
--  provável é rollback: o SQL Editor do Supabase roda o script inteiro numa
--  transação, e aquele arquivo abortava no `CREATE POLICY` duplicado — o que
--  desfazia também a criação do trigger, feita algumas linhas antes.
--
--  IMPACTO
--
--  Todo usuário novo fica sem linha em user_secrets. Consequências em cadeia:
--
--    - RegisterForm faz UPDATE em user_secrets logo após o cadastro
--      (document_number, email). Sem a linha, casa 0 registros e os dados
--      são perdidos silenciosamente.
--    - painel e checkout leem `plan` de uma linha inexistente.
--    - o proxy checa is_blocked com .single(), que devolve erro quando não
--      há linha.
--
--  Usuários já existentes não foram afetados: a migração de dados original
--  preencheu a tabela (profiles: 21, user_secrets: 21 na verificação).
-- ============================================================================

-- Endurecido em relação ao original: search_path fixo (obrigatório em
-- SECURITY DEFINER) e ON CONFLICT, para o trigger nunca derrubar o cadastro.
create or replace function public.handle_new_profile_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_secrets (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_secret on public.profiles;

create trigger on_profile_created_secret
  after insert on public.profiles
  for each row
  execute function public.handle_new_profile_secret();

-- Backfill: qualquer profile que esteja sem a linha ganha uma agora.
-- No-op se não houver nenhum (foi o caso na verificação).
insert into public.user_secrets (id)
select p.id
  from public.profiles p
 where not exists (
   select 1 from public.user_secrets us where us.id = p.id
 )
on conflict (id) do nothing;
