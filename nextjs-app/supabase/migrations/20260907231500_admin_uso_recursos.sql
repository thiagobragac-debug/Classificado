-- ============================================================================
--  Indicadores de uso de recursos (banco + storage) no dashboard do admin
-- ============================================================================
--
--  CONTEXTO: depois de popular o banco com 1200 anúncios (com fotos reais) e
--  planejar seguir crescendo, não existia nenhuma forma de acompanhar o
--  consumo de banco de dados/armazenamento pelo próprio site — só olhando o
--  dashboard do Supabase diretamente. Estas duas funções expõem os mesmos
--  números que o Supabase já calcula internamente (pg_database_size,
--  soma de storage.objects.metadata->>'size'), pra exibir em
--  /admin (app/(admin)/admin/page.tsx).
--
--  SECURITY DEFINER pra alcançar tanto estatísticas do catálogo do Postgres
--  quanto o schema `storage` (normalmente inacessível a authenticated/anon).
--  Sem checagem de is_admin() aqui dentro — a única forma de chamar estas
--  funções é via createAdminClient() (service_role) numa rota já protegida
--  por exigirAdmin() (app/api/admin/resource-usage/route.ts), mesmo padrão
--  das demais rotas admin deste projeto. grant só pra service_role: mesmo se
--  alguém tentasse chamar via RPC direto com a anon/authenticated key, RLS
--  do PostgREST nem lista a função como executável.
-- ============================================================================

create or replace function public.admin_db_usage()
returns table(total_bytes bigint, tables jsonb)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  return query
  select
    pg_database_size(current_database()) as total_bytes,
    (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select
          schemaname || '.' || relname as table_name,
          pg_total_relation_size(format('%I.%I', schemaname, relname)) as bytes
        from pg_stat_user_tables
        order by pg_total_relation_size(format('%I.%I', schemaname, relname)) desc
        limit 15
      ) t
    ) as tables;
end;
$$;

revoke all on function public.admin_db_usage() from public;
grant execute on function public.admin_db_usage() to service_role;

create or replace function public.admin_storage_usage()
returns table(bucket_id text, bytes bigint, object_count bigint)
language plpgsql
security definer
set search_path = 'public', 'storage'
as $$
begin
  return query
  select
    o.bucket_id,
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes,
    count(*)::bigint as object_count
  from storage.objects o
  group by o.bucket_id
  order by bytes desc;
end;
$$;

revoke all on function public.admin_storage_usage() from public;
grant execute on function public.admin_storage_usage() to service_role;
