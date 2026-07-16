-- ═══════════════════════════════════════════════════════════════
-- Tauze Class — Security Fixes (Auction RLS)
-- Migration: 07_auction_rls.sql
-- ═══════════════════════════════════════════════════════════════

-- Habilitar RLS nas tabelas
ALTER TABLE public.auction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_lots ENABLE ROW LEVEL SECURITY;

-- Políticas para auction_events
DROP POLICY IF EXISTS "Qualquer um pode ler eventos" ON public.auction_events;
CREATE POLICY "Qualquer um pode ler eventos" ON public.auction_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Apenas admins gerenciam eventos" ON public.auction_events;
CREATE POLICY "Apenas admins gerenciam eventos" ON public.auction_events
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- Políticas para auction_lots
DROP POLICY IF EXISTS "Qualquer um pode ler lotes" ON public.auction_lots;
CREATE POLICY "Qualquer um pode ler lotes" ON public.auction_lots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Apenas admins gerenciam lotes" ON public.auction_lots;
CREATE POLICY "Apenas admins gerenciam lotes" ON public.auction_lots
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );
