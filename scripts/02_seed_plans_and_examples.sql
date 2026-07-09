-- 1. Desvincular planos dos usuários existentes para evitar erro de Foreign Key
UPDATE public.profiles SET plan_id = NULL;

-- 2. Limpar verificações antigas que possam estar vinculadas aos usuários
DELETE FROM public.user_verifications;

-- 3. Limpar planos existentes de forma segura
DELETE FROM public.plans;

-- 4. Inserção dos Planos (conforme a imagem)
INSERT INTO public.plans (id, name, description, price, max_ads, max_photos, highlight_count, features, icon, sort_order) VALUES
('11111111-1111-1111-1111-111111111111', 'Grátis', 'Perfeito para quem está começando a vender ocasionalmente.', 0, 3, 5, 0, '["Suporte por email"]', '🌱', 1),
('22222222-2222-2222-2222-222222222222', 'Produtor PRO', 'Para produtores rurais e pequenas empresas que vendem com frequência.', 79.00, 15, 15, 2, '["15 fotos + vídeo por anúncio", "Suporte prioritário WhatsApp", "Selo de Vendedor Verificado"]', '🚀', 2),
('33333333-3333-3333-3333-333333333333', 'Premium', 'Para grandes produtores e empresas que querem dominar o mercado.', 149.00, 9999, 30, 10, '["30 fotos + vídeo por anúncio", "Suporte VIP 24/7", "Selo Verificado + Banner Premium", "Análise avançada de desempenho"]', '👑', 3);

-- 5. Opcional: Reatribuir o plano Grátis para todos os usuários
UPDATE public.profiles SET plan_id = '11111111-1111-1111-1111-111111111111';

-- 6. Gerar exemplos de verificações pendentes
-- Isso requer que existam usuários na tabela `profiles`. 
INSERT INTO public.user_verifications (user_id, type, document_url, selfie_url, status)
SELECT id, 'pessoa_fisica', 'https://fakeurl.com/doc.jpg', 'https://fakeurl.com/selfie.jpg', 'pending'
FROM public.profiles
LIMIT 2;
