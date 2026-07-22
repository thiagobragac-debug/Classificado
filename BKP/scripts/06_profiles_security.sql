-- ═══════════════════════════════════════════════════════════════
-- Tauze Class — Security Fixes (Profiles PII Leak)
-- Migration: 06_profiles_security.sql
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Remover política pública insegura ─────────────────────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- ── 2. Adicionar política restritiva na tabela profiles ────────
-- O usuário só pode ler e modificar seu próprio perfil (admins continuam tendo acesso total via política "Admins gerenciam perfis")
DROP POLICY IF EXISTS "Usuário lê seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuário lê seu próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- ── 3. Criar View para dados públicos dos usuários ─────────────
-- Esta view expõe APENAS os dados que podem ser públicos, mascarando PII como phone_whatsapp, subscription, kyc, etc.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    name,
    avatar_url,
    country,
    state,
    city,
    bio,
    verified,
    ads_count,
    created_at,
    is_admin
FROM public.profiles;

-- Conceder permissão de leitura pública na view
GRANT SELECT ON public.public_profiles TO anon, authenticated;
