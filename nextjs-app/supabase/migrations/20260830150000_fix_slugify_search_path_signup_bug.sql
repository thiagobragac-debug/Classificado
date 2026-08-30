-- BUG CRÍTICO CORRIGIDO (incidente ao vivo, 2026-08-30): cadastro e login
-- pararam de funcionar no site inteiro — /auth/v1/signup e
-- /auth/v1/token?grant_type=password respondiam 500 genérico ("Database
-- error saving new user" / "Database error querying schema").
--
-- Causa raiz encontrada via Postgres Logs do painel do Supabase (não
-- aparecia em nenhuma simulação via SQL direto, porque a role usada pra
-- testar manualmente sempre teve 'public' no search_path — só a role real
-- usada pelo GoTrue não tem):
--
--   42883: function slugify(text) does not exist
--
-- set_profiles_slug() (trigger BEFORE INSERT em public.profiles, dispara em
-- todo cadastro) chama slugify(...) sem qualificar o schema. slugify() vive
-- em public.slugify. A role supabase_auth_admin (a que o serviço de Auth usa
-- de verdade pra rodar o INSERT em auth.users, que dispara em cascata o
-- INSERT em profiles) tem search_path fixado só em 'auth' — sem 'public'.
-- Resultado: a única operação de cadastro/login do site inteiro que passa
-- por essa role ficou impossível, porque o trigger não consegue achar a
-- função em nenhum outro schema do search_path.
--
-- Foram encontrados e corrigidos, na mesma investigação, dois problemas
-- reais e distintos que TAMBÉM precisavam de correção (RLS/grants de
-- supabase_auth_admin no schema auth, aplicados ao vivo antes desta
-- migration) — mas nenhum dos dois era a causa deste erro específico; só
-- qualificar slugify() resolve o 42883.

create or replace function public.set_profiles_slug()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slugify(coalesce(NEW.display_name, NEW.name, 'vendedor')) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$function$;
