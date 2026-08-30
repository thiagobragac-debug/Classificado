-- ============================================================================
--  auction_events sem policy de escrita para admin
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança, 2026-08-30, achado baixo)
--
--  20260723071300_rls_hardening.sql habilita RLS em auction_events e cria só
--  uma policy de SELECT público (status != 'draft'). Não há INSERT/UPDATE/
--  DELETE para admin em nenhuma migration, diferente de 9 outras tabelas que
--  já passaram por essa mesma correção (categories, banners, auction_lots,
--  reports, testimonials, coupons, api_keys, contact_messages, subcategories
--  — todas via is_admin()). Isto tende a QUEBRAR a criação/edição de leilões
--  pelo painel admin, não a expor dados — mas fecha a lacuna pelo mesmo
--  padrão das demais.
-- ============================================================================

drop policy if exists "Admin gerencia leilões" on public.auction_events;
create policy "Admin gerencia leilões" on public.auction_events
  for all
  using (is_admin())
  with check (is_admin());
