-- ACHADO DE SEGURANÇA CRÍTICO, ativo em produção até esta migration.
-- Varredura completa de pg_policies por qualquer policy com qual = true
-- para roles diferentes de service_role revelou 4 tabelas totalmente
-- expostas para QUALQUER requisição não autenticada (só com a anon key,
-- que é pública por design — está no bundle JS do navegador):
--
--   subscriptions      -- "Admins can view all subscriptions" (SELECT,
--                          roles {public}, qual true): qualquer um lê
--                          TODA assinatura de TODO usuário (plano, valor,
--                          ids do gateway). Confirmado inserindo uma linha
--                          de teste e lendo com a anon key sem nenhum
--                          token — leu de volta, sem erro. Tabela está
--                          vazia hoje (0 assinaturas reais), mas a
--                          exposição é real e afetaria a primeira
--                          assinatura de verdade.
--
--   api_keys           -- "Service role read on api_keys" (SELECT) e
--                          "API service can update last_used_at" (UPDATE)
--                          — ambas roles {public}, qual/with_check true.
--                          Qualquer um lê secret_hash + email + permissions
--                          de todo parceiro, E qualquer um pode
--                          ESCREVER em qualquer linha (reativar chave
--                          revogada, elevar permissions para full_access).
--                          Confirmado no código (lib/api-auth.ts) que o
--                          fluxo real já usa service_role para tudo isso —
--                          o comentário ali já dizia "api_request_logs e
--                          api_keys não são acessíveis pela anon key",
--                          confirmando que essas policies públicas
--                          contradizem a própria intenção documentada e
--                          nunca deveriam ter ficado permissivas.
--
--   api_request_logs   -- "Rate limit select own logs only" (SELECT,
--                          roles {public}, qual true) — mesmo caso: nome
--                          sugere ownership, condição real não filtra
--                          nada. Também confirmado dead in practice (o
--                          fallback de rate limit já lê via service_role).
--
--   profiles           -- "Public profiles are viewable by everyone"
--                          expõe TODAS as colunas, incluindo is_admin e
--                          is_blocked — colunas zumbi: a fonte real
--                          dessas duas flags é user_secrets desde a
--                          migration 20260723072100_split_user_secrets.sql
--                          (mesma causa raiz dos commits 4800e66/4a5dc9e
--                          desta sessão), mas as colunas antigas nunca
--                          foram removidas de profiles nem tiveram a
--                          leitura pública revogada. Resultado: qualquer
--                          um consegue enumerar exatamente quais contas
--                          são admin — informação sem nenhum uso público
--                          legítimo, e útil só para quem quer atacar essas
--                          contas especificamente. Corrigido revogando
--                          SELECT só dessas 2 colunas (não a tabela
--                          inteira — display_name, avatar_url, bio, país
--                          etc. continuam públicos de propósito).

drop policy if exists "Admins can view all subscriptions" on public.subscriptions;
drop policy if exists "Admins can update subscriptions" on public.subscriptions;
create policy "Admins gerenciam assinaturas" on public.subscriptions
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "Apenas admin gerencia assinaturas" on public.subscriptions;

drop policy if exists "Usuário lê sua assinatura" on public.subscriptions;
create policy "Usuário lê sua assinatura" on public.subscriptions
  for select
  using (auth.uid() = user_id or is_admin());

drop policy if exists "Service role read on api_keys" on public.api_keys;
drop policy if exists "API service can update last_used_at" on public.api_keys;

drop policy if exists "Rate limit select own logs only" on public.api_request_logs;

revoke select (is_admin, is_blocked) on public.profiles from anon, authenticated;

-- Bônus, mesma varredura: demais tabelas com policy de admin quebrada
-- (profiles.is_admin, nunca setado por nenhum fluxo real) encontradas de
-- passagem. Sem exposição pública nova nestes casos — read público já era
-- intencional (leitura de país/estado/cidade, config visível pro app) —
-- só a ESCRITA por admin estava quebrada.
drop policy if exists "Admins modificam paises" on public.paises;
drop policy if exists "Apenas admins gerenciam paises" on public.paises;
create policy "Admins gerenciam paises" on public.paises
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Admins modificam estados" on public.estados;
drop policy if exists "Apenas admins gerenciam estados" on public.estados;
create policy "Admins gerenciam estados" on public.estados
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Admins modificam cidades" on public.cidades;
drop policy if exists "Apenas admins gerenciam cidades" on public.cidades;
create policy "Admins gerenciam cidades" on public.cidades
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Admins gerenciam configurações" on public.platform_settings;
drop policy if exists "Settings are fully modifiable by admins" on public.platform_settings;
create policy "Admins gerenciam configurações" on public.platform_settings
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Proprietários gerenciam leilões" on public.auctions;
create policy "Proprietários gerenciam leilões" on public.auctions
  for all
  using ((select ads.user_id from ads where ads.id = auctions.ad_id) = auth.uid() or is_admin())
  with check ((select ads.user_id from ads where ads.id = auctions.ad_id) = auth.uid() or is_admin());

drop policy if exists "Admins leem todos os segredos" on public.profile_secrets;
create policy "Admins leem todos os segredos" on public.profile_secrets
  for select using (is_admin());

drop policy if exists "Apenas admin gerencia verificacoes" on public.user_verifications;
create policy "Apenas admin gerencia verificacoes" on public.user_verifications
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Usuário lê sua verificação" on public.user_verifications;
create policy "Usuário lê sua verificação" on public.user_verifications
  for select using (auth.uid() = user_id or is_admin());

drop policy if exists "Usuário lê suas transações" on public.transactions;
create policy "Usuário lê suas transações" on public.transactions
  for select using (auth.uid() = user_id or is_admin());

-- plans já tinha uma policy correta (is_admin()) coexistindo com a
-- quebrada — sem impacto funcional, só limpeza.
drop policy if exists "Admins modificam planos" on public.plans;
