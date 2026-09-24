-- ============================================================================
--  PERFORMANCE: índices em foreign keys sem índice cobrindo
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Performance Advisor "Unindexed foreign
--  keys", revisão completa pedida pelo usuário, 2026-09-24)
--
--  22 foreign keys em 15 tabelas sem nenhum índice cobrindo a(s) coluna(s)
--  — impacta performance de JOIN e, mais importante pra este projeto, de
--  DELETE/UPDATE na tabela referenciada (toda FK com ON DELETE CASCADE
--  precisa varrer a tabela filha inteira sem índice pra achar as linhas a
--  cascatear). Lista completa obtida via consulta direta a pg_constraint/
--  pg_index (não adivinhada).
-- ============================================================================

create index if not exists idx_profiles_plan_id on public.profiles(plan_id);
create index if not exists idx_favorites_ad_id on public.favorites(ad_id);
create index if not exists idx_messages_receiver_id on public.messages(receiver_id);
create index if not exists idx_messages_ad_id on public.messages(ad_id);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_reports_reporter_id on public.reports(reporter_id);
create index if not exists idx_reports_ad_id on public.reports(ad_id);
create index if not exists idx_auctions_ad_id on public.auctions(ad_id);
create index if not exists idx_auctions_winner_id on public.auctions(winner_id);
create index if not exists idx_auction_bids_auction_id on public.auction_bids(auction_id);
create index if not exists idx_auction_bids_user_id on public.auction_bids(user_id);
create index if not exists idx_transactions_ad_id on public.transactions(ad_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_user_verifications_user_id on public.user_verifications(user_id);
create index if not exists idx_auction_lots_winner_id on public.auction_lots(winner_id);
create index if not exists idx_auction_lots_auction_id on public.auction_lots(auction_id);
create index if not exists idx_seller_reviews_reviewer_id on public.seller_reviews(reviewer_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_verification_requests_user_id on public.verification_requests(user_id);
create index if not exists idx_auction_lot_bids_user_id on public.auction_lot_bids(user_id);
create index if not exists idx_contact_messages_replied_by on public.contact_messages(replied_by);
create index if not exists idx_pending_password_recovery_user_id on public.pending_password_recovery(user_id);
