-- ============================================================================
--  PERFORMANCE + SEGURANÇA: consolida policies RLS duplicadas/sobrepostas
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Performance Advisor "Multiple Permissive
--  Policies", revisão completa pedida pelo usuário, 2026-09-24)
--
--  17 combinações tabela+comando+papel têm MAIS DE UMA policy permissiva —
--  toda query precisa avaliar TODAS e fazer OR entre elas. Lista e
--  expressões EXATAS obtidas via consulta direta a pg_policies (não
--  adivinhadas). Duas categorias:
--
--  A) Duplicatas puras (nomes diferentes, MESMA expressão) — acumuladas ao
--     longo do histórico de migrations sem nunca consolidar. Consolidar não
--     muda NADA de comportamento, só reduz o número de policies avaliadas.
--
--  B) Duplicatas que expõem MAIS do que deveriam: `banners` e `categories`
--     cada um tem uma policy antiga `USING (true)` (libera tudo, sem
--     filtro) coexistindo com a policy nova e corretamente restrita
--     (`active = true` / `status = 'active'`) que esta mesma auditoria
--     aplicou em 20260924120200. Como RLS faz OR entre policies
--     permissivas, a policy `true` ANULA a policy restrita — banner/
--     categoria inativo continua legível via API pública direta hoje,
--     mesmo com a correção anterior já aplicada. Removidas aqui.
--
--  Em `plans`, as duas policies (admin vs service_role) NÃO são duplicatas
--  — são dois papéis legítimos diferentes precisando do mesmo acesso.
--  Consolidadas com OR numa policy só (mesmo efeito, uma avaliação em vez
--  de duas). Em `platform_settings`, a policy só-admin é estritamente
--  redundante: a policy pública já libera exatamente o mesmo (chaves não-
--  secretas) pra qualquer um, então também cobre admin — removida sem
--  perda de acesso nenhuma.
--
--  Onde 2+ policies tinham a MESMA finalidade mas uma incluía `is_admin()`
--  a mais (ex.: messages/subscriptions/user_verifications), mantida só a
--  versão MAIS ABRANGENTE — o resultado de manter as 2-3 OR'd juntas
--  sempre seria idêntico a manter só a mais ampla sozinha.
-- ============================================================================

-- ─── banners (SELECT): remove as 2 policies "true" irrestritas ──────────
drop policy if exists "Banners publicos" on public.banners;
drop policy if exists "Leitura de banners" on public.banners;
-- mantém: "Leitura pública de banners ativos" (status = 'active')

-- ─── categories (SELECT): remove a policy "true" irrestrita ─────────────
drop policy if exists "Leitura pública de categorias" on public.categories;
-- mantém: "Leitura pública de categorias ativas" (active = true)

-- ─── cidades (SELECT): 3 duplicatas idênticas (true) ─────────────────────
drop policy if exists "Leitura publica de cidades" on public.cidades;
drop policy if exists "Permitir leitura pública de cidades" on public.cidades;
-- mantém: "Leitura pública de cidades"

-- ─── estados (SELECT): 3 duplicatas idênticas (true) ─────────────────────
drop policy if exists "Leitura publica de estados" on public.estados;
drop policy if exists "Permitir leitura pública de estados" on public.estados;
-- mantém: "Leitura pública de estados"

-- ─── paises (SELECT): 3 duplicatas idênticas (true) ──────────────────────
drop policy if exists "Leitura publica de paises" on public.paises;
drop policy if exists "Permitir leitura pública de paises" on public.paises;
-- mantém: "Leitura pública de paises"

-- ─── messages (SELECT): 3 versões, mantém só a mais abrangente ──────────
drop policy if exists "Users can view their own messages" on public.messages;
drop policy if exists "Usuários podem ler suas próprias mensagens" on public.messages;
-- mantém: "Usuários leem as próprias mensagens" (sender OR receiver OR is_admin())

-- ─── messages (DELETE): 2 versões idênticas ──────────────────────────────
drop policy if exists "Usuários podem deletar suas próprias mensagens" on public.messages;
-- mantém: "Usuários apagam as próprias conversas"

-- ─── subscriptions (SELECT): 3 versões, mantém só a mais abrangente ─────
drop policy if exists "Users can view their own subscriptions" on public.subscriptions;
drop policy if exists "Usuários podem ver suas próprias assinaturas" on public.subscriptions;
-- mantém: "Usuário lê sua assinatura" (auth.uid() = user_id OR is_admin())

-- ─── auction_bids (SELECT): 2 duplicatas idênticas (true) ────────────────
drop policy if exists "Leitura pública de lances" on public.auction_bids;
-- mantém: "Bids are public"

-- ─── auction_events (ALL): 2 duplicatas idênticas (is_admin()) ──────────
drop policy if exists "Apenas admins gerenciam eventos" on public.auction_events;
-- mantém: "Admin gerencia leilões"

-- ─── auctions (SELECT): 2 duplicatas idênticas (true) ────────────────────
drop policy if exists "Qualquer um pode ler leilões" on public.auctions;
-- mantém: "Auctions are public"

-- ─── plans (ALL): admin OU service_role, consolidado num OR só ──────────
drop policy if exists "Service role manage plans" on public.plans;
alter policy "Admins podem gerenciar planos" on public.plans
  using (is_admin() or ((select auth.role()) = 'service_role'::text))
  with check (is_admin() or ((select auth.role()) = 'service_role'::text));

-- ─── platform_settings (SELECT): policy admin é redundante ──────────────
-- "Configurações públicas são visíveis a qualquer um" (NOT is_secret_setting_key)
-- já cobre exatamente o mesmo caso pra QUALQUER papel, incluindo admin —
-- (is_admin() AND NOT secret) OR (NOT secret) simplifica pra só (NOT secret).
drop policy if exists "Admins leem configurações não sensíveis" on public.platform_settings;
-- mantém: "Configurações públicas são visíveis a qualquer um"

-- ─── seller_reviews (INSERT): 2 duplicatas idênticas ─────────────────────
drop policy if exists "Usuario avalia como si mesmo" on public.seller_reviews;
-- mantém: "Apenas usuários autenticados podem criar reviews"

-- ─── seller_reviews (SELECT): 2 duplicatas idênticas (true) ──────────────
drop policy if exists "Qualquer um pode ver reviews" on public.seller_reviews;
-- mantém: "Avaliacoes sao publicas"

-- ─── user_verifications (ALL): 2 duplicatas idênticas (is_admin()) ──────
drop policy if exists "Apenas admin gerencia verificacoes" on public.user_verifications;
-- mantém: "Admins podem ver e atualizar verificações"

-- ─── user_verifications (SELECT): mantém só a mais abrangente ──────────
drop policy if exists "Usuários podem ver suas próprias verificações" on public.user_verifications;
-- mantém: "Usuário lê sua verificação" (auth.uid() = user_id OR is_admin())
