-- BUG CRÍTICO CORRIGIDO: as policies de admin em categories, banners,
-- auction_lots, reports e testimonials checavam profiles.is_admin — mas
-- nenhum fluxo real do sistema grava nessa coluna. "Tornar alguém admin"
-- sempre grava em user_secrets.is_admin (ver
-- 20260823072100_split_user_secrets.sql e o hook de custom claims em
-- 20260822120100_custom_access_token_hook.sql). Resultado real, confirmado
-- testando com um admin de verdade: toda escrita nessas 5 tabelas pelo
-- painel admin retornava 200 com ZERO linhas afetadas — nem erro, nem
-- efeito. O admin clicava em "Banir"/"Ativar"/"Salvar" e a tela mostrava
-- sucesso, mas nada persistia. auction_events e institutional_pages já
-- usavam a função is_admin() (ou o equivalente via user_secrets) e sempre
-- funcionaram — esta migration alinha as demais tabelas ao mesmo padrão.

DROP POLICY IF EXISTS "Admins editam categorias" ON public.categories;
CREATE POLICY "Admins gerenciam categorias" ON public.categories
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins editam banners" ON public.banners;
DROP POLICY IF EXISTS "Admins gerenciam banners" ON public.banners;
CREATE POLICY "Admins gerenciam banners" ON public.banners
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Apenas admins gerenciam lotes" ON public.auction_lots;
CREATE POLICY "Admins gerenciam lotes" ON public.auction_lots
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- reports: preserva as policies de INSERT do próprio denunciante
-- ("Usuário logado envia denúncia" / "Anyone can report", auth.uid() =
-- reporter_id) intactas — só as 4 policies de ADMIN (leitura, update,
-- delete e a ALL redundante) usavam profiles.is_admin.
DROP POLICY IF EXISTS "Admins gerenciam denuncias" ON public.reports;
DROP POLICY IF EXISTS "Apenas admin deleta denúncias" ON public.reports;
DROP POLICY IF EXISTS "Apenas admin gerencia denúncias" ON public.reports;
DROP POLICY IF EXISTS "Sigilo total: apenas admin visualiza" ON public.reports;
CREATE POLICY "Admins gerenciam denuncias" ON public.reports
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- testimonials nunca teve NENHUMA policy de escrita para admin — só a
-- leitura pública existia. Toda tentativa de criar/editar/excluir
-- depoimento pelo admin sempre falhou em silêncio.
CREATE POLICY "Admins gerenciam depoimentos" ON public.testimonials
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
