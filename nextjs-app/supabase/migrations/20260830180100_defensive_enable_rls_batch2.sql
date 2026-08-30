-- ============================================================================
--  RLS reafirmada defensivamente — lote 2 (tabelas restantes) + limites de
--  Storage restantes (profile-banners, kyc-docs)
-- ============================================================================
--
--  PROBLEMA (re-auditoria de segurança, 2026-08-30)
--
--  20260830170000 reafirmou ENABLE ROW LEVEL SECURITY em 9 tabelas, mas a
--  mesma varredura, refeita do zero, encontrou a MESMA lacuna de
--  auditabilidade (só *policy*, nunca um ALTER TABLE ... ENABLE ROW LEVEL
--  SECURITY rastreado) em outras tabelas — a mais grave sendo `subscriptions`
--  (plano, preço e IDs de gateway de pagamento de cada usuário).
--
--  Também: 20260830170200 fechou allowed_mime_types/file_size_limit só em
--  ad-images/ad-videos. profile-banners (visível a QUALQUER visitante do
--  site, não só a quem vê um anúncio específico) e kyc-docs ficaram de fora,
--  com a mesma exposição (validação de tipo/tamanho só no componente React).
--
--  SOLUÇÃO: mesmo tratamento já aplicado — idempotente, só aperta o que já
--  é o comportamento esperado.
-- ============================================================================

alter table public.subscriptions       enable row level security;
alter table public.transactions        enable row level security;
alter table public.auctions            enable row level security;
alter table public.profile_secrets     enable row level security;
alter table public.user_verifications  enable row level security;
alter table public.paises              enable row level security;
alter table public.estados             enable row level security;
alter table public.cidades             enable row level security;

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit = 5 * 1024 * 1024  -- 5 MB — sem limite client-side hoje pra igualar; valor conservador
 where id = 'profile-banners';

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
       file_size_limit = 10 * 1024 * 1024  -- 10 MB, mesmo limite de VerificacaoClient.tsx (MAX_FILE_BYTES)
 where id = 'kyc-docs';
