-- ============================================================================
--  RLS reafirmada defensivamente — lote 3, e policies de leitura pública
--  que nunca chegaram a ser versionadas
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança independente, 2026-08-30)
--
--  Mesma varredura de auditabilidade de 20260830170000/20260830180100,
--  encontrando o mesmo padrão em mais 4 tabelas:
--
--  - public.api_request_logs: nenhuma migration confirma
--    ENABLE ROW LEVEL SECURITY (só um comentário não verificado em
--    20260723_api_indexes.sql). A policy de leitura admin-only já existe e
--    está correta (20260824170000, "Admin read on api_request_logs") — só
--    falta confirmar/reforçar que RLS de fato está ligada, e fechar o GRANT
--    direto de tabela como defesa em profundidade (mesmo padrão já usado
--    para ads_archive em 20260830190000).
--
--  - public.seller_reviews: tem constraints (20260823090000) mas nunca
--    ganhou ENABLE ROW LEVEL SECURITY nem nenhuma CREATE POLICY versionada.
--    components/seller/ReviewModal.tsx grava `reviewer_id` vindo do estado do
--    CLIENTE — sem uma policy `with check (auth.uid() = reviewer_id)`, uma
--    chamada direta ao PostgREST podia forjar uma avaliação em nome de
--    qualquer outro usuário real.
--
--  - public.eventos: só aparece recebendo colunas i18n (20260827100000),
--    nunca em nenhum ENABLE ROW LEVEL SECURITY/CREATE POLICY. Sem RLS
--    confirmada, um visitante anônimo poderia inserir/alterar eventos falsos
--    via REST público — inclusive o campo `link`, abrindo via de phishing.
--
--  - public.paises / public.estados / public.cidades: a ÚNICA policy
--    versionada é admin-only ("Admins gerenciam X", for all). A leitura
--    pública de que os dropdowns de cadastro/filtro dependem "já era
--    intencional" segundo o comentário de 20260824180000, mas nunca foi
--    versionada como policy — hoje presume-se que existe fora do controle de
--    versão.
--
--  SOLUÇÃO: mesmo tratamento idempotente já aplicado nos lotes anteriores.
-- ============================================================================

alter table public.api_request_logs enable row level security;
revoke all on public.api_request_logs from anon, authenticated;

alter table public.seller_reviews enable row level security;

drop policy if exists "Avaliacoes sao publicas" on public.seller_reviews;
create policy "Avaliacoes sao publicas" on public.seller_reviews
  for select using (true);

drop policy if exists "Usuario avalia como si mesmo" on public.seller_reviews;
create policy "Usuario avalia como si mesmo" on public.seller_reviews
  for insert with check (auth.uid() = reviewer_id);

drop policy if exists "Usuario edita a propria avaliacao" on public.seller_reviews;
create policy "Usuario edita a propria avaliacao" on public.seller_reviews
  for update using (auth.uid() = reviewer_id or is_admin())
  with check (auth.uid() = reviewer_id or is_admin());

drop policy if exists "Usuario apaga a propria avaliacao" on public.seller_reviews;
create policy "Usuario apaga a propria avaliacao" on public.seller_reviews
  for delete using (auth.uid() = reviewer_id or is_admin());

alter table public.eventos enable row level security;

drop policy if exists "Leitura publica de eventos" on public.eventos;
create policy "Leitura publica de eventos" on public.eventos
  for select using (true);

drop policy if exists "Admins gerenciam eventos" on public.eventos;
create policy "Admins gerenciam eventos" on public.eventos
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Leitura publica de paises" on public.paises;
create policy "Leitura publica de paises" on public.paises
  for select using (true);

drop policy if exists "Leitura publica de estados" on public.estados;
create policy "Leitura publica de estados" on public.estados
  for select using (true);

drop policy if exists "Leitura publica de cidades" on public.cidades;
create policy "Leitura publica de cidades" on public.cidades
  for select using (true);
