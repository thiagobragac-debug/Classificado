-- ============================================================
-- Complemento ao item 6 da auditoria (20260830190000): o fix
-- anterior só cobria funções SECURITY DEFINER (onde o
-- search_path mutável é um risco de escalação de privilégio real
-- — a função roda com o privilégio de quem a criou). Restavam 18
-- funções SECURITY INVOKER (triggers e RPCs de leitura pública)
-- ainda sem search_path fixo, sinalizadas pelo mesmo linter
-- (0011_function_search_path_mutable). O risco aqui é bem menor
-- (rodam com o privilégio de quem chama, não escalam nada), mas o
-- fix é o mesmo, sem custo, e fecha a categoria por completo.
-- ============================================================

begin;

do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search_path=%'
      )
      -- Exclui funções que pertencem a uma extensão (ex.: unaccent()
      -- do pg_trgm/unaccent) — são propriedade da extensão, não
      -- alteráveis diretamente, e alterar seria mexer em código de
      -- terceiro fora do nosso controle de qualquer forma.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public', r.proname, r.args);
  end loop;
end $$;

commit;
