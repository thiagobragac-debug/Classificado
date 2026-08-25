-- ============================================================================
--  Corrige 4 policies de storage.objects que quebravam TODO upload de
--  usuário comum (ad-images, ad-videos, profile-banners, kyc-docs)
-- ============================================================================
--
--  PROBLEMA
--
--  Achado testando ao vivo a rodada de correções de regras de negócio de
--  2026-08-25 (upload de foto no wizard, vídeo, banner de perfil — todos
--  falhando com "permission denied for table profiles", 400). Reproduzido
--  de forma isolada e independente: um usuário comum autenticado não
--  consegue subir NADA em `ad-images`, `ad-videos` nem `profile-banners`.
--
--  Causa raiz: 4 policies de storage.objects leem `profiles.is_admin`
--  como subquery direta —
--
--    (SELECT profiles.is_admin FROM profiles WHERE profiles.id = auth.uid()) = true
--
--  — em vez de chamar public.is_admin(). Isso funcionava até
--  20260824190000_restrict_profiles_privileged_columns.sql revogar o
--  SELECT de is_admin/is_blocked em profiles para authenticated/anon (fix
--  de segurança correto e necessário — antes qualquer um podia ler
--  is_admin de qualquer perfil). Só que múltiplas policies PERMISSIVE pro
--  mesmo comando se combinam com OR, e Postgres avalia TODAS elas — se uma
--  delas lança um erro real de permissão (não apenas "false"), o erro
--  ABORTA a operação inteira, mesmo que outra policy (ex.: "Auth users can
--  upload ad images") tivesse liberado. Por isso mesmo bucket sem relação
--  nenhuma com admin (ad-images, upload comum de anúncio) parou de
--  funcionar pra TODO mundo.
--
--  Mesma classe de problema já resolvida em outro lugar do projeto
--  (is_admin() é SECURITY DEFINER exatamente pra contornar esse tipo de
--  REVOKE) — só não tinha sido replicada aqui, porque estas 4 policies
--  foram criadas fora do histórico de migrations rastreado.
-- ============================================================================

drop policy if exists "Apenas admin sobe banners" on storage.objects;
create policy "Apenas admin sobe banners"
on storage.objects for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins leem todos os documentos KYC" on storage.objects;
create policy "Admins leem todos os documentos KYC"
on storage.objects for select
using (bucket_id = 'kyc-docs' and public.is_admin());

drop policy if exists "Usuário atualiza próprias imagens" on storage.objects;
create policy "Usuário atualiza próprias imagens"
on storage.objects for update
using (owner = auth.uid() or public.is_admin())
with check (owner = auth.uid() or public.is_admin());

drop policy if exists "Usuário deleta próprias imagens" on storage.objects;
create policy "Usuário deleta próprias imagens"
on storage.objects for delete
using (owner = auth.uid() or public.is_admin());
