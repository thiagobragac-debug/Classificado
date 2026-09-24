-- ============================================================================
--  DRIFT: policy de leitura pública de categories/banners nunca versionada
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  20260824150000_fix_admin_rls_profiles_to_user_secrets.sql criou só a
--  policy "Admins gerenciam categorias"/"Admins gerenciam banners" (FOR ALL
--  USING (is_admin())) — nenhuma migration deste repositório versiona uma
--  policy de SELECT público. Mas lib/supabase-server.ts::getServerCategories
--  e lib/supabase.ts::getBanners leem as duas tabelas com o cliente
--  anon/authenticated (nunca service_role) em toda visita à home/wizard de
--  anúncio/filtros — se RLS bloqueasse tudo exceto is_admin(), essas telas
--  retornariam vazio pra qualquer visitante, o que não é o comportamento
--  observado em produção.
--
--  Mesmo padrão de drift já confirmado neste código-base pra `plans`/
--  `platform_settings` (20260909120000, linhas 1-10: "3 policies ativas...
--  que NUNCA tiveram um CREATE POLICY em nenhuma das migrations anteriores
--  — só existiam em produção, fora do controle de versão") e pra
--  `institutional_pages` (20260831130000). Reconstruir o banco do zero a
--  partir de supabase/migrations/ hoje quebraria a navegação de categorias
--  e os banners da home.
--
--  SOLUÇÃO
--
--  Versiona a policy de leitura pública que o código já depende dela
--  existir, escopada exatamente ao que a aplicação já filtra no client
--  (categories.active = true / banners.status = 'active') — defesa em
--  profundidade: mesmo que um call site futuro esqueça o filtro, RLS não
--  expõe categoria/banner inativo pra visitante anônimo.
-- ============================================================================

drop policy if exists "Leitura pública de categorias ativas" on public.categories;
create policy "Leitura pública de categorias ativas" on public.categories
  for select
  using (active = true);

drop policy if exists "Leitura pública de banners ativos" on public.banners;
create policy "Leitura pública de banners ativos" on public.banners
  for select
  using (status = 'active');
