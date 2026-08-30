-- ============================================================================
--  Bucket de Storage site-assets sem policies rastreadas
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança, 2026-08-30, achado alto)
--
--  Os outros 4 buckets reais (ad-images, ad-videos, kyc-docs,
--  profile-banners) têm policies de escrita bem escopadas por dono/admin em
--  migrations anteriores (ex.: 20260826100200, no mesmo padrão usado aqui).
--  site-assets é citado só em comentário (20260826110000) como um dos 5
--  buckets reais, sem nenhuma policy própria em nenhuma migration — sem
--  confirmação de que não permite upload/sobrescrita por qualquer
--  autenticado, ou de que tem leitura pública configurada.
--
--  SOLUÇÃO: leitura pública (destinado a ativos estáticos de marca — logo,
--  ícones), escrita restrita a admin. Mesmo padrão de bucket scoping já usado
--  para profile-banners.
-- ============================================================================

drop policy if exists "Leitura pública de site-assets" on storage.objects;
create policy "Leitura pública de site-assets"
on storage.objects for select
using (bucket_id = 'site-assets');

drop policy if exists "Admin envia site-assets" on storage.objects;
create policy "Admin envia site-assets"
on storage.objects for insert
with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "Admin atualiza site-assets" on storage.objects;
create policy "Admin atualiza site-assets"
on storage.objects for update
using (bucket_id = 'site-assets' and public.is_admin())
with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "Admin remove site-assets" on storage.objects;
create policy "Admin remove site-assets"
on storage.objects for delete
using (bucket_id = 'site-assets' and public.is_admin());
