-- ============================================================================
--  Bucket avatars — feature nunca implementada (achado em auditoria de imagens)
-- ============================================================================
--
--  PROBLEMA
--
--  profiles.avatar_url é lida em mais de 10 arquivos do app (Header,
--  SellerProfileHeader, AdSidebar, TopSellersSection, admin/usuarios, etc.),
--  todos com fallback correto pra iniciais quando vazia — mas nenhum bucket
--  de Storage pra avatar jamais existiu e nenhuma tela grava a coluna. Só os
--  outros 4 buckets reais (ad-images, ad-videos, kyc-docs, profile-banners)
--  têm bucket + policies. O GRANT de UPDATE em profiles já cobre avatar_url
--  (20260824190000_restrict_profiles_privileged_columns.sql) — só faltava a
--  peça de Storage.
--
--  SOLUÇÃO: mesmo padrão exato já usado e testado em profile-banners
--  (20260830200200_policy_insert_profile_banners.sql) — bucket público
--  (avatar é exibido pra qualquer visitante, sem gate de plano, diferente do
--  banner que é Premium), dono grava só na própria pasta
--  (`${user.id}/...`), leitura pública. UPDATE/DELETE do próprio arquivo já
--  são cobertos pelas policies genéricas "Usuário atualiza/deleta próprias
--  imagens" (20260825160000), que não filtram por bucket — não precisam de
--  policy nova aqui.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Usuario sobe o proprio avatar" on storage.objects;
create policy "Usuario sobe o proprio avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (auth.uid())::text = (storage.foldername(name))[1]
);

-- Avatar é conteúdo público por natureza (exibido no perfil do vendedor, em
-- cards de anúncio etc. pra qualquer visitante via getPublicUrl).
drop policy if exists "Leitura publica de avatares" on storage.objects;
create policy "Leitura publica de avatares"
on storage.objects for select
using (bucket_id = 'avatars');
