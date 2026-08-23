-- ============================================================================
--  seller_reviews — impedir autoavaliação e nota repetida no mesmo par
-- ============================================================================
--
--  ACHADOS (revisão adversarial de 2026-08-23, testados contra produção com
--  usuários descartáveis)
--
--  1. Um usuário podia se autoavaliar: nada impedia
--
--       insert into seller_reviews (seller_id, reviewer_id, ...)
--       values (auth.uid(), auth.uid(), ...)
--
--     ReviewModal.tsx nunca esconde o botão "Avaliar" quando o visitante da
--     página é o próprio vendedor — a UI não é a defesa (é contornável com
--     chamada direta à API usando a anon key, que é pública), mas o banco
--     também não tinha nenhuma barreira.
--
--  2. O mesmo par (seller_id, reviewer_id) podia repetir indefinidamente
--
--     components/seller/ReviewModal.tsx:75 já esperava o contrário —
--     `if (error.message.includes('duplicate')) throw new Error('Você já
--     avaliou este vendedor.')` — mas não existia nenhuma constraint UNIQUE
--     para gerar esse erro. Um usuário podia inserir quantas notas quisesse
--     para o mesmo vendedor, inflando ou destruindo a média a vontade.
--
--  Confirmado sem nenhuma linha na tabela antes desta migration — nenhuma
--  autoavaliação e nenhum par duplicado pré-existente, então os dois
--  constraints abaixo são seguros de aplicar sem backfill.
-- ============================================================================

-- ALTER TABLE ADD CONSTRAINT não aceita IF NOT EXISTS no PostgreSQL (a mesma
-- classe de erro encontrada em 20260724_api_rls_fixes.sql, que usava CREATE
-- POLICY IF NOT EXISTS — sintaxe que também não existe). Os DO blocks abaixo
-- tornam esta migration reexecutável sem abortar na segunda vez.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seller_reviews_nao_autoavaliar'
  ) then
    alter table public.seller_reviews
      add constraint seller_reviews_nao_autoavaliar
      check (seller_id <> reviewer_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seller_reviews_par_unico'
  ) then
    alter table public.seller_reviews
      add constraint seller_reviews_par_unico
      unique (seller_id, reviewer_id);
  end if;
end $$;
