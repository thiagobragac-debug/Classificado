-- ============================================================================
--  profile-banners: faltava policy de INSERT/SELECT para o próprio dono
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança independente, 2026-08-30)
--
--  app/(public)/painel/_components/ProfileTab.tsx faz upload de banner de
--  perfil (feature paga, plans.has_banner) usando o client do navegador com
--  a sessão do próprio usuário comum — passa 100% pela RLS de
--  storage.objects. A ÚNICA policy rastreada para este bucket é "Apenas
--  admin sobe banners" (20260826100200), que é `for all` mas exige
--  `public.is_admin()` — cobre INSERT/SELECT/UPDATE/DELETE, só para quem já
--  é admin. As policies genéricas de dono (20260825160000) só cobrem UPDATE
--  e DELETE, nunca INSERT nem SELECT. Resultado: um usuário Premium comum
--  recebe 403 de RLS ao tentar subir o próprio banner — a feature paga nunca
--  funciona para clientes reais.
--
--  SOLUÇÃO: mesmo padrão já usado em ad-images/ad-videos — dono (path
--  prefixado pelo próprio uid, como o código já grava: `${user.id}/...`)
--  pode inserir e ler; a policy admin-only existente continua intacta para
--  o caso de uso administrativo.
--
--  BUG CORRIGIDO (validação ao vivo desta própria migration): a leitura do
--  achado original (baseada em grep nas migrations) estava incompleta — já
--  existia em produção uma policy de INSERT não versionada, "Usuários
--  autenticados podem enviar banners" (`with check: bucket_id =
--  'profile-banners' and auth.role() = 'authenticated'`), SEM nenhum
--  filtro de dono/pasta. Ou seja, a feature não estava quebrada como o
--  achado descrevia — mas qualquer usuário autenticado podia gravar no
--  banner de QUALQUER outro usuário (sobrescrita cruzada), porque RLS
--  combina policies permissivas com OR: a policy nova abaixo, sozinha, não
--  fechava esse gap enquanto a antiga (mais ampla) continuasse existindo.
--  Removida abaixo.
-- ============================================================================

drop policy if exists "Usuários autenticados podem enviar banners" on storage.objects;

drop policy if exists "Usuario sobe o proprio banner" on storage.objects;
create policy "Usuario sobe o proprio banner"
on storage.objects for insert
with check (
  bucket_id = 'profile-banners'
  and auth.role() = 'authenticated'
  and (auth.uid())::text = (storage.foldername(name))[1]
);

-- Banner de perfil é conteúdo público por natureza (exibido no perfil do
-- vendedor pra qualquer visitante via getPublicUrl) — leitura liberada geral,
-- não só para o dono.
drop policy if exists "Leitura publica de banners de perfil" on storage.objects;
create policy "Leitura publica de banners de perfil"
on storage.objects for select
using (bucket_id = 'profile-banners');
