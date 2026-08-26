-- ============================================================================
--  Policy "Apenas admin sobe banners" sem filtro de bucket — nome
--  enganoso, sem risco real (is_admin() já barra não-admin em qualquer
--  bucket), mas dava a admin acesso irrestrito a storage.objects inteiro
--  em vez de só profile-banners.
-- ============================================================================
drop policy if exists "Apenas admin sobe banners" on storage.objects;
create policy "Apenas admin sobe banners"
on storage.objects for all
using (bucket_id = 'profile-banners' and public.is_admin())
with check (bucket_id = 'profile-banners' and public.is_admin());
