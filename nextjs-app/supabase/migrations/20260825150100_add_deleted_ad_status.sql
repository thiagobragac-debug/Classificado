-- ============================================================================
--  Adiciona 'deleted' ao enum ad_status
-- ============================================================================
--
--  lib/supabase.ts:573 e lib/supabase-panel.ts:25 (deleteAd) já fazem, desde
--  que foram escritos, `update({status: 'deleted', ...})` como soft-delete —
--  o comentário no código é explícito: "preserva o registro para auditoria,
--  enquanto o remove da listagem pública". Só que o enum ad_status real em
--  produção nunca teve esse valor (só pending/active/rejected/paused/
--  expired/draft) — confirmado consultando pg_enum. Toda chamada de
--  "Excluir anúncio" está quebrada hoje, retornando erro do Postgres
--  (invalid input value for enum ad_status).
--
--  ALTER TYPE ... ADD VALUE não pode rodar dentro da mesma transação que uma
--  instrução que já USA o valor novo — por isso fica sozinho neste arquivo.
-- ============================================================================

alter type public.ad_status add value if not exists 'deleted';
