-- Achado da validação adversarial final (pré-produção), mais um segundo
-- achado mais grave descoberto ao investigar o primeiro:
--
-- 1) A migration 20260827150000 removeu a coluna profiles.plan, mas o
--    trigger tr_protect_sensitive_profile_fields (função
--    protect_sensitive_profile_fields) continuava fazendo
--    `new.plan = old.plan;` incondicionalmente.
--
-- 2) Investigando por que isso não quebra nenhum update de perfil hoje
--    (testado empiricamente via API real e via simulação SQL do contexto
--    exato de role/JWT do PostgREST), descobri a causa raiz: esta função é
--    SECURITY DEFINER (dona: postgres). Dentro de uma função SECURITY
--    DEFINER, `current_user` reflete o DONO da função (postgres), não quem
--    de fato chamou o UPDATE. Como o primeiro check era
--    `if current_user in ('service_role', 'postgres', 'supabase_admin')`,
--    ele é INCONDICIONALMENTE verdadeiro pra QUALQUER chamador — a função
--    sempre retorna cedo, e a lógica de proteção (inclusive a linha
--    quebrada de 'plan') nunca é alcançada por ninguém, desde que foi
--    criada. Ou seja: este trigger nunca ofereceu proteção real contra um
--    usuário comum alterar is_admin/verified/kyc_status/subscription_status/
--    plan_id/plan_expires_at do próprio perfil — a única barreira real hoje
--    é o GRANT de UPDATE por coluna em `authenticated` (que não inclui essas
--    colunas). Se esse GRANT for afrouxado no futuro (ex.: alguém rodar um
--    GRANT UPDATE genérico sem escopo de coluna, achando que o trigger
--    ainda cobre isso), não há nenhuma rede de segurança de verdade.
--
-- Corrigido: (a) removida a referência a 'plan' (coluna não existe mais);
-- (b) trocado `current_user in (...)` — quebrado por SECURITY DEFINER —
-- por `auth.role() is null` (sessão sem contexto de JWT nenhum: SQL Editor
-- do dashboard, `supabase db query`, migrations — auth.role() lê
-- request.jwt.claim.role via current_setting(..., true), que retorna NULL
-- quando o GUC nunca foi setado, e não é afetado por SECURITY DEFINER por
-- ser uma leitura de GUC de sessão, não de role SQL). O check de
-- `auth.role() = 'service_role'` já funcionava corretamente antes (também
-- baseado em GUC, não em current_user) e continua igual.
-- SECURITY DEFINER e search_path="" preservados EXATAMENTE como o original
-- (confirmado via pg_proc.proconfig antes desta migration) — CREATE OR
-- REPLACE sem essas cláusulas reverteria pra SECURITY INVOKER e search_path
-- padrão, enfraquecendo o hardening que já existia. Todas as chamadas no
-- corpo já são schema-qualificadas (auth.role(), public.is_admin()), então
-- funcionam normalmente com search_path vazio.
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.is_admin = old.is_admin;
  new.verified = old.verified;
  new.kyc_status = old.kyc_status;
  new.subscription_status = old.subscription_status;
  new.plan_id = old.plan_id;
  new.plan_expires_at = old.plan_expires_at;

  return new;
end;
$$;
