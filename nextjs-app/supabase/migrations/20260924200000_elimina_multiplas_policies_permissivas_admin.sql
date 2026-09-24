-- ============================================================================
--  PERFORMANCE + HIGIENE: elimina "Multiple Permissive Policies" causado
--  pelo padrão sistêmico "Admins gerenciam X" (FOR ALL, is_admin())
--  sobreposto a policies de usuário/público na mesma tabela+ação
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Performance Advisor, revisão completa
--  pedida pelo usuário, 2026-09-24, DEPOIS da consolidação de duplicatas
--  puras em 20260924180000 — isto é outra coisa)
--
--  ~23 tabelas têm uma policy `FOR ALL "Admins gerenciam X" USING
--  (is_admin())` coexistindo com policies específicas de usuário/público
--  na MESMA ação (ex.: SELECT). Diferente de duplicata pura, as DUAS são
--  necessárias (admin precisa ver/gerenciar tudo, inclusive inativo;
--  usuário só o que é seu/público) — mas RLS faz OR entre elas, então o
--  Postgres avalia as duas em toda query, o que o Advisor sinaliza como
--  suboptimal.
--
--  FIX: elimina a policy FOR ALL do admin. Ação por ação:
--    a) já existe policy de usuário pra aquela ação → funde a condição do
--       admin nela via OR (ALTER POLICY, só USING/WITH CHECK — mesmo
--       resultado de acesso, uma só policy avaliada em vez de duas);
--    b) a policy de usuário já é `true` (irrestrito) ou já tinha
--       "OR is_admin()" fundido numa correção anterior desta sessão
--       (subscriptions, user_verifications/SELECT) → cobertura do admin
--       já é 100% redundante (true OR is_admin() = true) — só dropa o
--       ALL, sem tocar em mais nada;
--    c) a ação não tem NENHUMA policy de usuário (ex.: DELETE em tabelas
--       só-leitura-pública) → cria policy dedicada só-admin pra aquela
--       ação, no padrão já usado em platform_settings ("Admins criam/
--       atualizam/removem X").
--
--  Em `messages`, não existe policy ALL nenhuma (a condição de admin já
--  está dentro das próprias policies via OR) — o que sobrou ali são 2
--  policies redundantes por ABSORÇÃo (mais estreitas, sempre implicadas
--  pela mais ampla já existente), mesmo padrão já usado em 20260924180000.
--
--  Em `reports`, "Usuário logado envia denúncia" (autenticado,
--  auth.uid()=reporter_id) é redundante: pra autenticado, auth.uid() nunca
--  é null, então "Anyone can report" já reduz pra exatamente a mesma
--  condição — dropada por absorção antes da fusão com admin.
--
--  Em `auction_bids`, "Usuário insere lance no próprio nome" (autenticado)
--  é IDÊNTICA a "Anyone can bid" pra esse papel — dropada por duplicata
--  pura antes da fusão com admin.
--
--  Em `eventos`, existiam 3 policies de SELECT: a do admin (redundante,
--  já que as outras duas são `true`) + 2 duplicatas puras entre si
--  ("Allow public read access on eventos" / "Leitura publica de eventos")
--  — mantida só a última, em português, consistente com o resto do schema.
--
--  Todos os textos USING/WITH CHECK abaixo vêm de consulta direta a
--  pg_policies (colada pelo usuário), não reconstruídos de memória —
--  cada ALTER/CREATE reproduz exatamente a condição original, só
--  reorganizando ONDE ela mora.
-- ============================================================================

begin;

-- ─── ads ────────────────────────────────────────────────────────────────
drop policy "Admins gerenciam anuncios" on public.ads;

alter policy "Active ads are viewable by everyone" on public.ads
  using ((((status = 'active'::ad_status) and (not (exists (select 1 from user_secrets us where ((us.id = ads.user_id) and (us.is_blocked = true)))))) or (user_id = (select auth.uid())) or is_admin()));

alter policy "Users can insert their own ads" on public.ads
  with check (((select auth.uid()) = user_id) or is_admin());

alter policy "Dono pode alterar seu próprio anúncio" on public.ads
  using ((user_id = (select auth.uid())) or is_admin())
  with check ((user_id = (select auth.uid())) or is_admin());

create policy "Admins removem anuncios" on public.ads
  for delete using (is_admin());

-- ─── auction_bids ───────────────────────────────────────────────────────
drop policy "Usuário insere lance no próprio nome" on public.auction_bids;
drop policy "Admins gerenciam lances" on public.auction_bids;

alter policy "Anyone can bid" on public.auction_bids
  with check (((select auth.uid()) = user_id) or is_admin());

create policy "Admins atualizam lances" on public.auction_bids
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem lances" on public.auction_bids
  for delete using (is_admin());

-- ─── auction_events ─────────────────────────────────────────────────────
drop policy "Admin gerencia leilões" on public.auction_events;

alter policy "Anyone can view published auction events" on public.auction_events
  using ((status <> 'draft'::text) or is_admin());

create policy "Admins inserem eventos de leilao" on public.auction_events
  for insert with check (is_admin());
create policy "Admins atualizam eventos de leilao" on public.auction_events
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem eventos de leilao" on public.auction_events
  for delete using (is_admin());

-- ─── auction_lot_bids ───────────────────────────────────────────────────
drop policy "Admins gerenciam lances de lote" on public.auction_lot_bids;

alter policy "Usuário insere lance no próprio nome" on public.auction_lot_bids
  with check (((select auth.uid()) = user_id) or is_admin());

create policy "Admins atualizam lances de lote" on public.auction_lot_bids
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem lances de lote" on public.auction_lot_bids
  for delete using (is_admin());

-- ─── auction_lots ───────────────────────────────────────────────────────
drop policy "Admins gerenciam lotes" on public.auction_lots;

alter policy "Anyone can view lots of published events" on public.auction_lots
  using ((exists (select 1 from auction_events e where ((e.id = auction_lots.auction_id) and (e.status <> 'draft'::text)))) or is_admin());

create policy "Admins inserem lotes" on public.auction_lots
  for insert with check (is_admin());
create policy "Admins atualizam lotes" on public.auction_lots
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem lotes" on public.auction_lots
  for delete using (is_admin());

-- ─── auctions (já vinha com "OR is_admin()" fundido no owner) ────────────
drop policy "Proprietários gerenciam leilões" on public.auctions;

create policy "Proprietários inserem leiloes" on public.auctions
  for insert with check ((((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin()));
create policy "Proprietários atualizam leiloes" on public.auctions
  for update
  using ((((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin()))
  with check ((((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin()));
create policy "Proprietários removem leiloes" on public.auctions
  for delete using ((((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin()));

-- ─── banners ────────────────────────────────────────────────────────────
drop policy "Admins gerenciam banners" on public.banners;

alter policy "Leitura pública de banners ativos" on public.banners
  using ((status = 'active'::banner_status) or is_admin());

create policy "Admins inserem banners" on public.banners
  for insert with check (is_admin());
create policy "Admins atualizam banners" on public.banners
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem banners" on public.banners
  for delete using (is_admin());

-- ─── categories ─────────────────────────────────────────────────────────
drop policy "Admins gerenciam categorias" on public.categories;

alter policy "Leitura pública de categorias ativas" on public.categories
  using ((active = true) or is_admin());

create policy "Admins inserem categorias" on public.categories
  for insert with check (is_admin());
create policy "Admins atualizam categorias" on public.categories
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem categorias" on public.categories
  for delete using (is_admin());

-- ─── cidades (SELECT já é `true` — cobertura do admin é redundante) ──────
drop policy "Admins gerenciam cidades" on public.cidades;

create policy "Admins inserem cidades" on public.cidades
  for insert with check (is_admin());
create policy "Admins atualizam cidades" on public.cidades
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem cidades" on public.cidades
  for delete using (is_admin());

-- ─── estados (mesmo padrão de cidades) ───────────────────────────────────
drop policy "Admins gerenciam estados" on public.estados;

create policy "Admins inserem estados" on public.estados
  for insert with check (is_admin());
create policy "Admins atualizam estados" on public.estados
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem estados" on public.estados
  for delete using (is_admin());

-- ─── eventos (3 SELECTs sobrepostos: 2 duplicatas `true` + admin redundante) ──
drop policy "Admins gerenciam eventos" on public.eventos;
drop policy "Allow public read access on eventos" on public.eventos;
-- mantém "Leitura publica de eventos" (true) sem alteração

create policy "Admins inserem eventos" on public.eventos
  for insert with check (is_admin());
create policy "Admins atualizam eventos" on public.eventos
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem eventos" on public.eventos
  for delete using (is_admin());

-- ─── institutional_pages (SELECT já é `true`) ────────────────────────────
drop policy "Admin gerencia páginas institucionais" on public.institutional_pages;

create policy "Admins inserem paginas institucionais" on public.institutional_pages
  for insert with check (is_admin());
create policy "Admins atualizam paginas institucionais" on public.institutional_pages
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem paginas institucionais" on public.institutional_pages
  for delete using (is_admin());

-- ─── messages (sem policy ALL — redundância por absorção) ────────────────
drop policy "Usuários leem suas próprias mensagens" on public.messages;
drop policy "Usuários deletam mensagens enviadas" on public.messages;

-- ─── paises (SELECT já é `true`) ──────────────────────────────────────────
drop policy "Admins gerenciam paises" on public.paises;

create policy "Admins inserem paises" on public.paises
  for insert with check (is_admin());
create policy "Admins atualizam paises" on public.paises
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem paises" on public.paises
  for delete using (is_admin());

-- ─── plans ──────────────────────────────────────────────────────────────
drop policy "Admins podem gerenciar planos" on public.plans;

alter policy "Public read active plans" on public.plans
  using ((is_active = true) or is_admin() or ((select auth.role()) = 'service_role'::text));

create policy "Admins inserem planos" on public.plans
  for insert with check (is_admin() or ((select auth.role()) = 'service_role'::text));
create policy "Admins atualizam planos" on public.plans
  for update
  using (is_admin() or ((select auth.role()) = 'service_role'::text))
  with check (is_admin() or ((select auth.role()) = 'service_role'::text));
create policy "Admins removem planos" on public.plans
  for delete using (is_admin() or ((select auth.role()) = 'service_role'::text));

-- ─── profile_secrets ──────────────────────────────────────────────────────
drop policy "Usuários leem seus próprios segredos" on public.profile_secrets;
drop policy "Usuários alteram seus próprios segredos" on public.profile_secrets;

alter policy "Admins leem todos os segredos" on public.profile_secrets
  using (is_admin() or (id = (select auth.uid())));

create policy "Usuários inserem seus próprios segredos" on public.profile_secrets
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Usuários atualizam seus próprios segredos" on public.profile_secrets
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy "Usuários removem seus próprios segredos" on public.profile_secrets
  for delete to authenticated using (id = (select auth.uid()));

-- ─── profiles ───────────────────────────────────────────────────────────
drop policy "Admins gerenciam perfis" on public.profiles;

alter policy "Public profiles are viewable by everyone" on public.profiles
  using (((not (exists (select 1 from user_secrets us where ((us.id = profiles.id) and (us.is_blocked = true))))) or (id = (select auth.uid())) or is_admin()));

alter policy "Users can update their own profile" on public.profiles
  using (((select auth.uid()) = id) or is_admin());

create policy "Admins inserem perfis" on public.profiles
  for insert to authenticated with check (is_admin());
create policy "Admins removem perfis" on public.profiles
  for delete to authenticated using (is_admin());

-- ─── reports ────────────────────────────────────────────────────────────
drop policy "Usuário logado envia denúncia" on public.reports;
drop policy "Admins gerenciam denuncias" on public.reports;

alter policy "Anyone can report" on public.reports
  with check ((((select auth.uid()) = reporter_id) or (((select auth.uid()) is null) and (reporter_id is null))) or is_admin());

create policy "Admins leem denuncias" on public.reports
  for select using (is_admin());
create policy "Admins atualizam denuncias" on public.reports
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem denuncias" on public.reports
  for delete using (is_admin());

-- ─── subcategories (SELECT já é `true`) ──────────────────────────────────
drop policy "Admins gerenciam subcategorias" on public.subcategories;

create policy "Admins inserem subcategorias" on public.subcategories
  for insert with check (is_admin());
create policy "Admins atualizam subcategorias" on public.subcategories
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem subcategorias" on public.subcategories
  for delete using (is_admin());

-- ─── subscriptions (SELECT já tinha "OR is_admin()" fundido em 20260924180000) ──
drop policy "Admins gerenciam assinaturas" on public.subscriptions;

create policy "Admins inserem assinaturas" on public.subscriptions
  for insert with check (is_admin());
create policy "Admins atualizam assinaturas" on public.subscriptions
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem assinaturas" on public.subscriptions
  for delete using (is_admin());

-- ─── testimonials (SELECT já é `true`) ───────────────────────────────────
drop policy "Admins gerenciam depoimentos" on public.testimonials;

create policy "Admins inserem depoimentos" on public.testimonials
  for insert with check (is_admin());
create policy "Admins atualizam depoimentos" on public.testimonials
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem depoimentos" on public.testimonials
  for delete using (is_admin());

-- ─── user_verifications (SELECT já tinha "OR is_admin()" fundido antes) ──
drop policy "Admins podem ver e atualizar verificações" on public.user_verifications;

alter policy "Usuários podem inserir verificações" on public.user_verifications
  with check (((select auth.uid()) = user_id) or is_admin());

create policy "Admins atualizam verificacoes" on public.user_verifications
  for update using (is_admin());
create policy "Admins removem verificacoes" on public.user_verifications
  for delete using (is_admin());

-- ─── verification_requests ────────────────────────────────────────────────
drop policy "Admins gerenciam solicitacoes de verificacao" on public.verification_requests;

alter policy "Usuario ve suas proprias solicitacoes" on public.verification_requests
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Usuario cria sua propria solicitacao" on public.verification_requests
  with check (((select auth.uid()) = user_id) or is_admin());

create policy "Admins atualizam solicitacoes de verificacao" on public.verification_requests
  for update using (is_admin()) with check (is_admin());
create policy "Admins removem solicitacoes de verificacao" on public.verification_requests
  for delete using (is_admin());

commit;
