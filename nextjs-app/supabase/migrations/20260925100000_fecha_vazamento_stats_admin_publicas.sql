-- ============================================================================
--  SEGURANÇA CRÍTICA: fecha vazamento real de dados de negócio via RPC pública
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, revisão completa pedida pelo usuário, 2026-09-25)
--
--  Confirmado via chamada direta como anon (sem login nenhum), em produção:
--
--    POST /rest/v1/rpc/get_admin_subs_kpis
--      -> {"mrr":237,"premium_count":0,"canceled_count":0}
--    POST /rest/v1/rpc/get_api_stats
--      -> {"total_keys":0,"active_keys":0,"requests_24h":0,"requests_7d":0,...}
--    POST /rest/v1/rpc/get_admin_stats
--      -> erro (referencia admin_stats_cache, tabela/view que não existe mais
--         — dropada em 20260831130000 junto com refresh_admin_stats_cache,
--         mas esta função irmã ficou pra trás)
--
--  As três são SECURITY DEFINER, sem NENHUM guard interno de is_admin().
--
--  Confirmado via grep no repo inteiro: NENHUM arquivo do app chama nenhuma
--  das três. São órfãs, substituídas por caminhos corretos:
--  - MRR/KPIs de assinatura: /api/admin/subscriptions (rota própria, com
--    checagem de admin via cookie de sessão)
--  - Stats de API: app/(admin)/admin/api-keys/usage/page.tsx chama
--    get_api_daily_stats (nome diferente, formato diferente — nem existe
--    com esse nome; cai no fallback client-side já existente)
--
--  CORREÇÃO DA CORREÇÃO (a v1 desta migration, `revoke ... from public`,
--  rodou "Success" mas NÃO fechou o vazamento — confirmado com um segundo
--  teste ao vivo depois do usuário rodar). Causa raiz, confirmada agora via
--  consulta direta a information_schema.routine_privileges: as três
--  funções têm EXECUTE concedido DIRETO aos papéis `anon`/`authenticated`
--  (grantee = 'anon'/'authenticated' nomeados, não 'PUBLIC') — diferente
--  das funções-trigger corrigidas em 20260925100100 (essas sim só tinham
--  acesso via o pseudo-papel PUBLIC, por isso `revoke ... from public`
--  bastou pra elas). `revoke ... from public` só remove a entrada do
--  pseudo-papel PUBLIC na ACL — NÃO toca em concessões diretas a um papel
--  nomeado, mesmo que o papel também herde de PUBLIC. Confirmado também
--  via pg_default_acl que não existe nenhuma regra de "toda função nova
--  recebe EXECUTE" no schema public — os grants diretos a anon/authenticated
--  nestas três foram feitos manualmente (mesmo padrão de drift do resto da
--  sessão), não vêm de configuração automática da Supabase.
--
--  SOLUÇÃO DEFINITIVA: revoga dos DOIS lugares onde o acesso pode morar —
--  do pseudo-papel PUBLIC (correto pra funções sem grant direto) E dos
--  papéis nomeados anon/authenticated (correto pra estas três, que têm
--  grant direto). Sem re-grant pra ninguém: as três não têm nenhum uso
--  legítimo hoje.
-- ============================================================================

revoke all on function public.get_admin_stats() from public;
revoke all on function public.get_admin_stats() from anon, authenticated;

revoke all on function public.get_admin_subs_kpis() from public;
revoke all on function public.get_admin_subs_kpis() from anon, authenticated;

revoke all on function public.get_api_stats() from public;
revoke all on function public.get_api_stats() from anon, authenticated;
