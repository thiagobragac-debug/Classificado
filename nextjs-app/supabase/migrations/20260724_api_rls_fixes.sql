-- Migration: 20260724_api_rls_fixes.sql
-- Reescrita em 2026-08-22. Ver histórico do git para a versão original.
--
-- ============================================================================
--  ATENÇÃO — esta migration NUNCA foi aplicada, e isso foi sorte.
-- ============================================================================
--
--  A versão original usava `CREATE POLICY IF NOT EXISTS`, sintaxe que não
--  existe no PostgreSQL (CREATE POLICY não aceita IF NOT EXISTS em nenhuma
--  versão). O arquivo abortava com erro de sintaxe na primeira instrução,
--  então nada aqui chegou ao banco — nem o COMMENT ON TABLE no fim.
--
--  Só que aplicá-la como estava teria aberto um buraco sério:
--
--    CREATE POLICY "API service can insert ads" ON public.ads
--      FOR INSERT WITH CHECK (true);
--
--  Sem restrição de papel, essa policy vale para `anon`. E a anon key está no
--  bundle do browser, pública por definição. Qualquer visitante do site
--  poderia inserir anúncios arbitrários direto no PostgREST, sem passar por
--  API key, sem rate limit e sem a sanitização de campos. O mesmo vale para
--  "API service can update last_used_at" em public.api_keys.
--
--  Por isso as policies não foram recriadas aqui.
--
-- ============================================================================
--  O QUE DE FATO PRECISA SER CORRIGIDO (em código, não em RLS)
-- ============================================================================
--
--  Os dois problemas que a migration original tentava resolver são reais:
--
--    1. POST /api/v1/ads falha com violação de RLS.
--    2. api_keys.last_used_at nunca é atualizado (o erro é engolido pelo
--       .catch() de logRequest, que é fire-and-forget).
--
--  A causa não é falta de policy: é que app/api/v1/ads/route.ts monta o client
--  com SUPABASE_ANON e o repassa para logRequest()/checkRateLimit() — que em
--  lib/api-auth.ts declaram receber `ReturnType<typeof getServiceClient>`. A
--  incompatibilidade está mascarada por casts `as any` nas chamadas.
--
--  A correção é usar o client de service_role nesses caminhos de escrita. A
--  API v1 já se autentica por API key na camada de aplicação (permissões,
--  rate limit e sanitização), então o acesso ao banco deve ser service_role e
--  a RLS continua fechada para `anon`.
--
-- ============================================================================

-- Remove as policies permissivas caso tenham sido aplicadas à mão em algum
-- ambiente antes desta correção.
DROP POLICY IF EXISTS "API service can insert ads"          ON public.ads;
DROP POLICY IF EXISTS "API service can update last_used_at" ON public.api_keys;

COMMENT ON TABLE public.api_request_logs IS
  'API request logs. SELECT: permissiva, mas a aplicação sempre filtra por api_key_id. '
  'INSERT: aberta para logging fire-and-forget. Leitura no admin: restrita a is_admin. '
  'Dados sensíveis (ip_address, user_agent) nunca são expostos em endpoint público.';
