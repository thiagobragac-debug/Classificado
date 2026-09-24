-- ============================================================================
--  PERFORMANCE: envolve auth.uid()/auth.role() em (select ...) nas policies
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Performance Advisor "Auth RLS
--  Initialization Plan", revisão completa pedida pelo usuário, 2026-09-24)
--
--  Chamar auth.uid()/auth.jwt()/auth.role() DIRETO dentro de uma policy RLS
--  faz o Postgres reavaliar a chamada LINHA A LINHA durante a query, em vez
--  de uma vez só. Envolver em `(select auth.uid())` faz o planner tratar
--  como um initplan (avaliado uma única vez por query) — otimização pura,
--  sem NENHUMA mudança de comportamento/semântica de segurança: a
--  comparação lógica resultante é idêntica, só muda COMO o Postgres calcula
--  o valor de auth.uid() internamente.
--
--  46 policies em 21 tabelas. Lista e texto EXATO de cada using/with_check
--  obtidos via consulta direta a pg_policies (não reconstruído de migration
--  antiga, que poderia estar desatualizada) — cada ALTER POLICY abaixo troca
--  SÓ a chamada auth.uid()/auth.role() por (select auth.uid())/
--  (select auth.role()), byte a byte igual ao resto da expressão original.
--
--  ALTER POLICY sem repetir FOR/TO: por design, altera só USING/WITH CHECK,
--  preservando o comando (SELECT/INSERT/UPDATE/DELETE/ALL) e os papéis
--  (public/authenticated) exatamente como já estão — zero risco de mudar
--  QUEM a policy afeta, só COMO auth.uid() é calculado.
--
--  Chamadas a is_admin() (função própria, não auth.*()) NÃO são alteradas
--  aqui — não fizeram parte do achado do linter, fora de escopo desta
--  correção pontual.
-- ============================================================================

-- ─── ad_quota_pending ───────────────────────────────────────────────────
alter policy "Usuário lê a própria pendência de cota de anúncios" on public.ad_quota_pending
  using ((select auth.uid()) = user_id);

-- ─── ad_views_daily ─────────────────────────────────────────────────────
alter policy "Donos dos anúncios podem ver gráficos" on public.ad_views_daily
  using (exists (select 1 from ads where ((ads.id = ad_views_daily.ad_id) and (ads.user_id = (select auth.uid())))));

-- ─── ads ────────────────────────────────────────────────────────────────
alter policy "Active ads are viewable by everyone" on public.ads
  using (((status = 'active'::ad_status) and (not (exists (select 1 from user_secrets us where ((us.id = ads.user_id) and (us.is_blocked = true)))))) or (user_id = (select auth.uid())));

alter policy "Dono pode alterar seu próprio anúncio" on public.ads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can insert their own ads" on public.ads
  with check ((select auth.uid()) = user_id);

-- ─── auction_bids ───────────────────────────────────────────────────────
alter policy "Anyone can bid" on public.auction_bids
  with check ((select auth.uid()) = user_id);

alter policy "Usuário insere lance no próprio nome" on public.auction_bids
  with check ((select auth.uid()) = user_id);

-- ─── auction_lot_bids ───────────────────────────────────────────────────
alter policy "Usuário insere lance no próprio nome" on public.auction_lot_bids
  with check ((select auth.uid()) = user_id);

-- ─── auctions ───────────────────────────────────────────────────────────
alter policy "Proprietários gerenciam leilões" on public.auctions
  using (((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin())
  with check (((select ads.user_id from ads where (ads.id = auctions.ad_id)) = (select auth.uid())) or is_admin());

-- ─── customers ──────────────────────────────────────────────────────────
alter policy "Usuários podem ver seus próprios customers" on public.customers
  using ((select auth.uid()) = user_id);

-- ─── favorites ──────────────────────────────────────────────────────────
alter policy "Gerenciamento total dos próprios favoritos" on public.favorites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can manage their own favorites" on public.favorites
  using ((select auth.uid()) = user_id);

-- ─── invoices ───────────────────────────────────────────────────────────
alter policy "Usuários podem ver suas próprias faturas" on public.invoices
  using ((select auth.uid()) = user_id);

-- ─── messages ───────────────────────────────────────────────────────────
alter policy "Users can view their own messages" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

alter policy "Usuários apagam as próprias conversas" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

alter policy "Usuários deletam mensagens enviadas" on public.messages
  using ((select auth.uid()) = sender_id);

alter policy "Usuários leem as próprias mensagens" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id) or is_admin());

alter policy "Usuários leem suas próprias mensagens" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

alter policy "Usuários podem deletar suas próprias mensagens" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

alter policy "Usuários podem ler suas próprias mensagens" on public.messages
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

alter policy "msgs_insert_dono_ou_resposta" on public.messages
  with check (((select auth.uid()) = sender_id) and (is_ad_owner(ad_id, receiver_id) or (exists (select 1 from messages m where ((m.ad_id = messages.ad_id) and (m.sender_id = messages.receiver_id) and (m.receiver_id = (select auth.uid())))))));

-- ─── pending_password_recovery ──────────────────────────────────────────
alter policy "Usuário gerencia a própria marcação de recuperação" on public.pending_password_recovery
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── plans ──────────────────────────────────────────────────────────────
alter policy "Service role manage plans" on public.plans
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

-- ─── profile_secrets ────────────────────────────────────────────────────
alter policy "Usuários alteram seus próprios segredos" on public.profile_secrets
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Usuários leem seus próprios segredos" on public.profile_secrets
  using (id = (select auth.uid()));

-- ─── profiles ───────────────────────────────────────────────────────────
alter policy "Public profiles are viewable by everyone" on public.profiles
  using ((not (exists (select 1 from user_secrets us where ((us.id = profiles.id) and (us.is_blocked = true))))) or (id = (select auth.uid())));

alter policy "Users can update their own profile" on public.profiles
  using ((select auth.uid()) = id);

-- ─── reports ────────────────────────────────────────────────────────────
alter policy "Anyone can report" on public.reports
  with check (((select auth.uid()) = reporter_id) or (((select auth.uid()) is null) and (reporter_id is null)));

alter policy "Usuário logado envia denúncia" on public.reports
  with check ((select auth.uid()) = reporter_id);

-- ─── seller_reviews ─────────────────────────────────────────────────────
alter policy "Apenas usuários autenticados podem criar reviews" on public.seller_reviews
  with check ((select auth.uid()) = reviewer_id);

alter policy "Usuario apaga a propria avaliacao" on public.seller_reviews
  using (((select auth.uid()) = reviewer_id) or is_admin());

alter policy "Usuario avalia como si mesmo" on public.seller_reviews
  with check ((select auth.uid()) = reviewer_id);

alter policy "Usuario edita a propria avaliacao" on public.seller_reviews
  using (((select auth.uid()) = reviewer_id) or is_admin())
  with check (((select auth.uid()) = reviewer_id) or is_admin());

-- ─── subscriptions ──────────────────────────────────────────────────────
alter policy "Users can view their own subscriptions" on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "Usuário lê sua assinatura" on public.subscriptions
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Usuários podem ver suas próprias assinaturas" on public.subscriptions
  using ((select auth.uid()) = user_id);

-- ─── transactions ───────────────────────────────────────────────────────
alter policy "Users can insert pending transactions" on public.transactions
  with check (((select auth.uid()) = user_id) and (status = 'pending'::text));

alter policy "Usuário lê suas transações" on public.transactions
  using (((select auth.uid()) = user_id) or is_admin());

-- ─── user_secrets ───────────────────────────────────────────────────────
alter policy "Users can insert their own secrets" on public.user_secrets
  with check ((select auth.uid()) = id);

alter policy "Users can update their own secrets" on public.user_secrets
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Users can view their own secrets" on public.user_secrets
  using (id = (select auth.uid()));

-- ─── user_verifications ─────────────────────────────────────────────────
alter policy "Usuário lê sua verificação" on public.user_verifications
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Usuários podem inserir verificações" on public.user_verifications
  with check ((select auth.uid()) = user_id);

alter policy "Usuários podem ver suas próprias verificações" on public.user_verifications
  using ((select auth.uid()) = user_id);

-- ─── verification_requests ──────────────────────────────────────────────
alter policy "Usuario cria sua propria solicitacao" on public.verification_requests
  with check ((select auth.uid()) = user_id);

alter policy "Usuario ve suas proprias solicitacoes" on public.verification_requests
  using ((select auth.uid()) = user_id);
