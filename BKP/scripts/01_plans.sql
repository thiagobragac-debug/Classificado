-- Criação da tabela de Planos (plans)
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    interval TEXT DEFAULT 'mês',
    max_ads INTEGER DEFAULT 3,
    max_photos INTEGER DEFAULT 5,
    highlight_count INTEGER DEFAULT 0,
    features JSONB DEFAULT '[]'::jsonb,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserção dos Planos Padrão
INSERT INTO public.plans (id, name, description, price, max_ads, max_photos, highlight_count, features, icon, sort_order) VALUES
(uuid_generate_v4(), 'Grátis', 'Perfeito para quem está começando a vender ocasionalmente.', 0, 3, 5, 0, '["Suporte por email"]', '🌱', 1),
(uuid_generate_v4(), 'Produtor PRO', 'Para produtores rurais e pequenas empresas que vendem com frequência.', 79.00, 15, 15, 2, '["Suporte prioritário WhatsApp", "Selo de Vendedor Verificado"]', '🚀', 2),
(uuid_generate_v4(), 'Premium', 'Para grandes produtores e empresas que querem dominar o mercado.', 149.00, 9999, 30, 10, '["Suporte VIP 24/7", "Selo Verificado + Banner Premium", "Análise avançada de desempenho"]', '👑', 3);

-- Tabela de Verificação de Vendedores (user_verifications)
CREATE TABLE IF NOT EXISTS public.user_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'pessoa_fisica', -- 'pessoa_fisica' ou 'pessoa_juridica'
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    document_url TEXT,
    selfie_url TEXT,
    admin_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Atualização da Tabela de Usuários (profiles)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
