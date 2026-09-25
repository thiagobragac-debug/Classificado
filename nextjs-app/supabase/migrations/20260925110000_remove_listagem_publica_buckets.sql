-- ============================================================================
--  SEGURANÇA: remove policy de SELECT (listagem) em 5 buckets públicos
-- ============================================================================
--
--  PROBLEMA (achado via Supabase Security Advisor "Public Bucket Allows
--  Listing", revisão completa pedida pelo usuário, 2026-09-25)
--
--  avatars, ad-images, ad-videos, profile-banners e site-assets são buckets
--  PUBLIC — a exibição normal de arquivo (`/storage/v1/object/public/...`)
--  já funciona independente de RLS, é assim que bucket público serve
--  conteúdo. A policy de SELECT em storage.objects só tem efeito prático
--  sobre a API de LISTAGEM (`/storage/v1/object/list/{bucket}`), que expõe
--  os nomes de todos os arquivos/pastas do bucket pra qualquer chamador.
--
--  Confirmado ao vivo como anon: dá pra listar o conteúdo de ad-images
--  hoje (baixo risco — nomes de pasta são IDs de anúncio, já públicos via
--  a tabela `ads`); avatars/profile-banners vieram vazios (bucket sem
--  arquivo ainda), mas o nome de pasta ali normalmente é o `user_id` —
--  listar viraria enumeração de usuários cadastrados assim que alguém
--  subir avatar/banner.
--
--  Confirmado via grep no repo inteiro: o app NUNCA chama
--  `.storage.from(...).list(...)` em nenhum bucket — a policy de SELECT
--  não protege nenhum uso real, só habilita a listagem que ninguém usa.
--  Removê-la não afeta a exibição de imagens (continua funcionando via o
--  caminho público, que independe de RLS).
-- ============================================================================

drop policy "Leitura publica de avatares" on storage.objects;
drop policy "Anyone can view ad images" on storage.objects;
drop policy "Videos visíveis por todos" on storage.objects;
drop policy "Banners visíveis por todos" on storage.objects;
drop policy "Leitura publica de banners de perfil" on storage.objects;
drop policy "Leitura pública de site-assets" on storage.objects;
