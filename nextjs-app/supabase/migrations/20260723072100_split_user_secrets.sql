-- 1. Criar a nova tabela de segredos do usuário
CREATE TABLE IF NOT EXISTS public.user_secrets (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    plan TEXT DEFAULT 'free',
    plan_id TEXT,
    email TEXT,
    stripe_customer_id TEXT,
    document_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Migrar os dados existentes de profiles para user_secrets
-- Note: usaremos um bloco DO para evitar erros caso as colunas não existam em algum ambiente
DO $$
BEGIN
    INSERT INTO public.user_secrets (id, is_admin, is_blocked, plan, email, plan_id, stripe_customer_id, document_number)
    SELECT 
        id, 
        COALESCE((SELECT is_admin FROM public.profiles p2 WHERE p2.id = p.id), false),
        COALESCE((SELECT is_blocked FROM public.profiles p2 WHERE p2.id = p.id), false),
        COALESCE((SELECT plan FROM public.profiles p2 WHERE p2.id = p.id), 'free'),
        (SELECT email FROM public.profiles p2 WHERE p2.id = p.id),
        (SELECT plan_id FROM public.profiles p2 WHERE p2.id = p.id),
        (SELECT stripe_customer_id FROM public.profiles p2 WHERE p2.id = p.id),
        (SELECT document_number FROM public.profiles p2 WHERE p2.id = p.id)
    FROM public.profiles p
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- Se falhar por colunas inexistentes na versão local, faz apenas o insert básico
    INSERT INTO public.user_secrets (id)
    SELECT id FROM public.profiles
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 3. Trigger para manter a criação sincronizada
-- Quando um novo profile for criado, cria um user_secrets vazio associado
CREATE OR REPLACE FUNCTION public.handle_new_profile_secret()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_secrets (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_secret ON public.profiles;
CREATE TRIGGER on_profile_created_secret
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_secret();

-- 4. RLS para user_secrets
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

-- Somente o próprio usuário ou admin pode ler seus secrets
DROP POLICY IF EXISTS "Users can view their own secrets" ON public.user_secrets;
CREATE POLICY "Users can view their own secrets"
ON public.user_secrets FOR SELECT
USING (auth.uid() = id);

-- Restringe a LINHA ao próprio usuário. Atenção: RLS não filtra COLUNAS — a
-- trava de is_admin / is_blocked / plan / plan_id / stripe_customer_id vem do
-- trigger criado em 20260822120000_user_secrets_privilege_guard.sql.
DROP POLICY IF EXISTS "Users can update their own non-critical secrets" ON public.user_secrets;
CREATE POLICY "Users can update their own non-critical secrets"
ON public.user_secrets FOR UPDATE
USING (auth.uid() = id);

-- 5. Remover colunas sensíveis da tabela profiles
-- Envolvemos em DO para não quebrar se já foi removido
DO $$
BEGIN
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_blocked;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan_id;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS document_number;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
