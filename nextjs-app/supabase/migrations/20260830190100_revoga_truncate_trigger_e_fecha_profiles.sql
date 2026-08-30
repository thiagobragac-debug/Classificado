-- ============================================================
-- Complemento à migration 20260830190000 (auditoria de segurança).
--
-- Ao verificar se o REVOKE do item 4 (profiles.is_admin/is_blocked)
-- realmente tinha efeito, achei que NÃO tinha: anon/authenticated
-- têm GRANT de TABELA completo (DELETE/INSERT/TRIGGER/TRUNCATE) em
-- profiles — um REVOKE por coluna não tem efeito por baixo de um
-- GRANT de tabela inteira (mesma armadilha já documentada em
-- 20260824190000 pro UPDATE, aqui repetida pro INSERT/DELETE).
--
-- Ao checar o alcance real do problema, o mesmo GRANT ALL default
-- do Supabase (nunca revisado pra TRUNCATE/TRIGGER especificamente)
-- está presente em TODA tabela do schema public, não só profiles —
-- e TRUNCATE não é coberto por Row Level Security de jeito nenhum
-- (é tudo-ou-nada, só depende do GRANT): o achado do item 3 da
-- migration anterior (ads_archive sem RLS) era só a ponta mais
-- grave e mais fácil de explorar (RLS desligada ali) de um padrão
-- de permissão presente em toda tabela.
-- ============================================================

begin;

-- Nenhuma operação legítima do app usa TRUNCATE ou CREATE TRIGGER
-- pelos papéis anon/authenticated (confirmado: são operações de
-- DBA/migration, nunca de request de usuário) — revogar não muda
-- nenhum comportamento observável, só fecha o único ponto cego que
-- a RLS não cobre, em toda tabela do schema de uma vez.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke truncate, trigger on table public.%I from anon, authenticated', r.tablename);
  end loop;
end $$;

-- profiles: fecha de vez o item 4. Confirmado por grep completo em
-- app/lib/components: zero INSERT ou DELETE client-side em
-- profiles no código inteiro — criação de perfil acontece via
-- handle_new_user() (trigger SECURITY DEFINER no signup), nunca
-- inserida pelo próprio usuário; não existe exclusão de perfil
-- pelo usuário. Revoga a permissão de tabela inteira (o REVOKE por
-- coluna da migration anterior fica redundante, mas inofensivo).
revoke insert, delete on public.profiles from anon, authenticated;

-- REFERENCES nunca é necessário pros papéis anon/authenticated (só
-- serve pra criar FK apontando pra esta tabela, exige DDL que eles
-- não têm de qualquer forma) — revogado por completude.
revoke references on public.profiles from anon, authenticated;

commit;

-- pg_tables não inclui views — public_profiles e top_sellers_view
-- (as duas views SECURITY DEFINER corrigidas na migration anterior)
-- também carregavam o mesmo TRUNCATE/TRIGGER residual do GRANT ALL
-- default. Inofensivo na prática (Postgres não aceita TRUNCATE numa
-- view comum, sem INSTEAD OF), mas revogado por completude.
revoke truncate, trigger on table public.public_profiles, public.top_sellers_view
  from anon, authenticated;
