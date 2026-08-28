-- ============================================================================
--  Realtime nunca esteve ligado pra NENHUMA tabela deste projeto
-- ============================================================================
--
--  Descoberto ao corrigir a ausência de atualização ao vivo no leilão de
--  lotes (3ª rodada de validação): o código cliente já assinava
--  `postgres_changes` corretamente (LotGrid.tsx, MessagesTab.tsx), mas
--  `pg_publication_tables` pra `supabase_realtime` retornava ZERO linhas —
--  a publicação existe, mas nenhuma tabela foi adicionada a ela. Sem isso,
--  nenhuma subscription client-side recebe evento nenhum, silenciosamente
--  (sem erro — só nunca chega nada).
--
--  auction_lots: espectadores do leilão ao vivo ficam presos no valor
--  antigo até dar F5 manual (achado confirmado desta rodada).
--  messages: o chat comprador↔vendedor (MessagesTab.tsx) tem a mesma
--  assinatura pronta desde antes — mesma causa raiz, mesmo sintoma,
--  descoberto de carona ao investigar o leilão.
-- ============================================================================

-- BUG CORRIGIDO (validação adversarial final): ALTER PUBLICATION ... ADD
-- TABLE não é idempotente — falha com "already member of publication" se a
-- tabela já estiver na publicação, derrubando QUALQUER replay desta
-- migration inteira (supabase db reset local, CI, uma branch de preview
-- cujo banco já tenha esse estado). Guarda por pg_publication_tables antes
-- de cada ADD TABLE, mesmo padrão idiomático de "if not exists" usado nas
-- outras migrations deste projeto.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_lots'
  ) then
    alter publication supabase_realtime add table public.auction_lots;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
