-- 1. HARDENING DE ADS (ANÚNCIOS)
-- Habilita o RLS na tabela ads (caso ainda não esteja)
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- Política 1: Todos podem ler anúncios que estão 'active'
DROP POLICY IF EXISTS "Public ads are viewable by everyone." ON public.ads;
CREATE POLICY "Public ads are viewable by everyone."
ON public.ads FOR SELECT
USING (status = 'active');

-- Política 2: O dono (user_id) pode ver seus próprios anúncios independentemente do status (draft, pending, active, etc)
DROP POLICY IF EXISTS "Users can view their own ads." ON public.ads;
CREATE POLICY "Users can view their own ads."
ON public.ads FOR SELECT
USING (auth.uid() = user_id);

-- Política 3: O dono pode inserir anúncios, desde que o user_id bata com o token logado
DROP POLICY IF EXISTS "Users can insert their own ads." ON public.ads;
CREATE POLICY "Users can insert their own ads."
ON public.ads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Política 4: O dono pode atualizar seus próprios anúncios
DROP POLICY IF EXISTS "Users can update their own ads." ON public.ads;
CREATE POLICY "Users can update their own ads."
ON public.ads FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política 5: O dono pode deletar seus próprios anúncios
DROP POLICY IF EXISTS "Users can delete their own ads." ON public.ads;
CREATE POLICY "Users can delete their own ads."
ON public.ads FOR DELETE
USING (auth.uid() = user_id);

-- PREVENÇÃO DE SPOOFING DE STATUS: Impede que o usuário ative o próprio anúncio ignorando 'pending'
-- Isso requer uma Database Function + Trigger se quisermos barrar. Como é nível Big Tech, vamos criar a Trigger:
CREATE OR REPLACE FUNCTION prevent_direct_activation()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o status está mudando para 'active' e o usuário que faz a alteração NÃO é o admin (assumindo que role de user comum é authenticated)
    IF NEW.status = 'active' AND OLD.status IN ('draft', 'pending') AND auth.jwt()->>'role' != 'service_role' THEN
        -- Como Big Tech, forçamos que o anúncio passe por revisão se foi editado ou criado, a menos que uma flag automática de sistema decida
        -- Por enquanto, impedimos a ativação direta. O usuário deve mandar para 'pending'.
        -- (Descomente se houver processo de aprovação, senão mantenha comentado para não quebrar a aplicação atual)
        -- RAISE EXCEPTION 'Não é permitido ativar anúncios diretamente. Envie para pending.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP TRIGGER IF EXISTS enforce_ad_status ON public.ads;
-- CREATE TRIGGER enforce_ad_status
--     BEFORE UPDATE ON public.ads
--     FOR EACH ROW
--     EXECUTE FUNCTION prevent_direct_activation();


-- 2. HARDENING DE PROFILES E VIEW PÚBLICA
-- Para "Big Tech", a melhor prática retrocompatível é ocultar os campos sensíveis usando VIEW e revogar acesso
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Garante que o dono veja TUDO da sua própria linha
DROP POLICY IF EXISTS "Users can view own profile." ON public.profiles;
CREATE POLICY "Users can view own profile."
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Impede que outras pessoas leiam dados de profiles diretos
-- (Se houver políticas que permitam isso, você deveria excluí-las no sistema de produção)

-- Cria a View segura
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    name,
    display_name,
    avatar_url,
    verified,
    country,
    state,
    city,
    created_at
FROM public.profiles;

-- Garante que todos possam ler da view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 3. HARDENING DE AUCTION_EVENTS
ALTER TABLE public.auction_events ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ver eventos que NÃO sejam draft
DROP POLICY IF EXISTS "Anyone can view published auction events" ON public.auction_events;
CREATE POLICY "Anyone can view published auction events"
ON public.auction_events FOR SELECT
USING (status != 'draft');

-- Apenas admins podem modificar (assumindo que não há auth.uid() para eventos públicos comuns inserindo)
-- As mutações seriam feitas pelo admin dashboard que provavelmente tem policy para isso ou usa service_role.
