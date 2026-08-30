-- ============================================================================
--  Buckets ad-images/ad-videos sem allowed_mime_types/file_size_limit
-- ============================================================================
--
--  PROBLEMA (re-auditoria de segurança, 2026-08-30, achado alto)
--
--  A validação de tipo/tamanho de upload (StepPhotos.tsx: allowlist de
--  imagem sem SVG, 10MB; vídeo mp4/webm, 50MB) existe SÓ no componente
--  React. `lib/supabase.ts` (uploadAdImage/uploadAdVideo) não repete
--  nenhuma checagem, e nenhuma migration configura `allowed_mime_types`/
--  `file_size_limit` nos buckets — a única barreira real hoje é RLS de
--  QUEM pode gravar em qual pasta, não O QUE é gravado. Qualquer usuário
--  autenticado pode chamar essas funções direto do console do navegador
--  (já estão no bundle) com um File de `image/svg+xml` (SVG com script
--  embutido, servido pelo domínio público do Storage) ou de qualquer
--  tamanho.
--
--  SOLUÇÃO
--
--  `storage.buckets` é uma tabela normal com as colunas `allowed_mime_types`
--  (text[]) e `file_size_limit` (bigint, em bytes) — usar UPDATE em vez de
--  criar os buckets do zero, já que eles existem fora do controle de
--  versão (mesmo padrão de is_admin()/messages). Só aperta o que já é
--  aceito na prática; não afeta nenhum arquivo já enviado.
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
       file_size_limit = 10 * 1024 * 1024  -- 10 MB, mesmo limite de StepPhotos.tsx
 where id = 'ad-images';

update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/webm'],
       file_size_limit = 50 * 1024 * 1024  -- 50 MB, mesmo limite de StepPhotos.tsx
 where id = 'ad-videos';
