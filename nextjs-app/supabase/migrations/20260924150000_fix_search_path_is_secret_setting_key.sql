-- ============================================================================
--  HIGIENE: search_path mutável em is_secret_setting_key()
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Security Advisor, revisão completa pedida
--  pelo usuário, 2026-09-24)
--
--  is_secret_setting_key(text) — criada em 20260830160000, recriada em
--  20260907230000 — nunca teve `set search_path` explícito, diferente da
--  quase totalidade das outras funções deste projeto (convenção já
--  estabelecida desde 20260830190200_search_path_funcoes_security_invoker.sql).
--  Risco prático baixo aqui especificamente (IMMUTABLE, sem acesso a tabela,
--  só compara contra um array literal — não há nome de tabela/função sem
--  schema pra um search_path malicioso sequestrar), mas fechado por
--  consistência e defesa em profundidade.
--
--  SOLUÇÃO
--
--  Mesma lista de chaves de lib/secret-settings.ts (SECRET_SETTING_KEYS),
--  confirmada idêntica às 10 entradas já em produção — só adiciona
--  search_path, comportamento inalterado.
-- ============================================================================

create or replace function public.is_secret_setting_key(k text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  -- Mesma lista de lib/secret-settings.ts (SECRET_SETTING_KEYS) — se uma
  -- chave secreta nova for criada, precisa entrar nos dois lugares.
  select k = any (array[
    'stripe_secret_key', 'stripe_webhook_secret',
    'mp_access_token', 'mp_webhook_secret',
    'pagarme_api_key', 'pagarme_webhook_secret',
    'asaas_api_key', 'asaas_webhook_token',
    'resend_api_key', 'smtp_password'
  ]);
$$;
