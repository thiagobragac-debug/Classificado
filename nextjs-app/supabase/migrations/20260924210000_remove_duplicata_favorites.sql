-- ============================================================================
--  PERFORMANCE: remove duplicata pura em favorites (esquecida na migration
--  anterior 20260924200000 — identificada na varredura mas não incluída)
-- ============================================================================
--
--  "Gerenciamento total dos próprios favoritos" (FOR ALL, authenticated) e
--  "Users can manage their own favorites" (FOR ALL, public) têm a MESMA
--  condição exata: (select auth.uid()) = user_id (confirmado via pg_policies,
--  colado pelo usuário, 2026-09-24). Mantida a versão TO authenticated
--  (mais explícita); a TO public é redundante — pra anon, auth.uid() é
--  sempre null, então a condição nunca é satisfeita de qualquer forma,
--  então dropar não muda nenhum acesso real.
-- ============================================================================

drop policy "Users can manage their own favorites" on public.favorites;
