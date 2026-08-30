-- ============================================================================
--  ADVISÓRIO — NÃO é uma migration, NÃO está em supabase/migrations/
-- ============================================================================
--
--  Por quê este arquivo existe fora do fluxo normal de migrations
--
--  A função public.is_admin() — usada em ~20 RLS policies (categorias,
--  banners, leilões, cupons, api_keys, platform_settings, etc.) — não existe
--  em nenhuma migration versionada deste repositório. Foi criada fora do
--  histórico de versionamento, provavelmente direto no dashboard do
--  Supabase. Isso é um risco real de auditabilidade (ver dossiê de
--  segurança, achado ADM-1/DB-... "alto"), mas corrigi-lo com um
--  `CREATE OR REPLACE FUNCTION` às cegas é, ele mesmo, arriscado: este
--  projeto já teve uma regressão real e documentada (migration
--  20260828130000) causada exatamente por um `CREATE OR REPLACE FUNCTION`
--  que não repetiu todas as cláusulas de segurança da versão anterior
--  (SECURITY DEFINER / search_path revertendo silenciosamente pro padrão).
--  Aplicar uma reconstrução às cegas, por engano, é o tipo exato de erro que
--  o time já cometeu e corrigiu antes.
--
--  A definição abaixo é uma RECONSTRUÇÃO baseada em evidência indireta forte
--  (não uma cópia da definição real, que eu não tive acesso — a tentativa de
--  consultar o banco de produção foi corretamente bloqueada pelo ambiente):
--
--   • app/(admin)/layout.tsx consulta user_secrets.is_admin (não
--     profiles.is_admin) pra decidir acesso ao painel.
--   • user_secrets.is_admin só pode ser escrita por service_role (trigger
--     guard_user_secrets_privileged_columns, 20260822120000).
--   • O comentário em 20260825160000 diz explicitamente que is_admin() é
--     SECURITY DEFINER "exatamente para contornar" o REVOKE de SELECT em
--     profiles.is_admin.
--
--  COMO USAR ESTE ARQUIVO COM SEGURANÇA
--
--  1. Antes de aplicar qualquer coisa, rode isto no SQL Editor de produção:
--
--       select pg_get_functiondef('public.is_admin()'::regprocedure);
--
--  2. Compare o resultado com a definição abaixo.
--     - Se forem equivalentes (mesma lógica, SECURITY DEFINER, search_path
--       fixo): rode o `create or replace` abaixo só para versionar — o
--       comportamento não muda, você só ganha uma migration real no
--       histórico. Depois disso, MOVA este arquivo pra
--       supabase/migrations/ com um timestamp válido.
--     - Se forem DIFERENTES: NÃO aplique este arquivo. Em vez disso, copie
--       a definição real retornada pelo passo 1 e crie a migration de
--       baseline com ELA, não com a reconstrução abaixo.
--
--  3. Teste em ambiente de staging/preview antes de produção, se houver um.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.user_secrets where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;
