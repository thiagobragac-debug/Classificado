-- ============================================================================
--  subscriptions.currency — necessário pra não exibir/somar USD como BRL
-- ============================================================================
--
--  Efeito colateral direto de plans.price_usd (20260901120000): assinaturas
--  cobradas em USD (Stripe, cliente internacional) gravam subscriptions.price
--  num número que agora pode ser BRL OU USD — sem registrar qual, o
--  histórico de faturas do usuário (BillingTab.tsx) e o MRR do admin
--  (admin/assinaturas/page.tsx) formatam/somam tudo como se fosse sempre BRL.
--  Default 'BRL' preserva a leitura de toda linha já existente.
-- ============================================================================

alter table public.subscriptions add column if not exists currency text not null default 'BRL';
