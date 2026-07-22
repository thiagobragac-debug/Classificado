-- 1. Criação da Tabela de Reviews
CREATE TABLE IF NOT EXISTS seller_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para Reviews
ALTER TABLE seller_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ver reviews" 
ON seller_reviews FOR SELECT USING (true);

CREATE POLICY "Apenas usuários autenticados podem criar reviews" 
ON seller_reviews FOR INSERT 
WITH CHECK (auth.uid() = reviewer_id);


-- 2. Criação da Tabela de Visitas Diárias (Analytics Pro)
CREATE TABLE IF NOT EXISTS ad_views_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_id UUID REFERENCES ads(id) ON DELETE CASCADE,
  view_date DATE DEFAULT CURRENT_DATE,
  views_count INTEGER DEFAULT 1,
  UNIQUE(ad_id, view_date)
);

ALTER TABLE ad_views_daily ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ler, para permitir o dono ver seu gráfico
CREATE POLICY "Donos dos anúncios podem ver gráficos"
ON ad_views_daily FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM ads WHERE ads.id = ad_views_daily.ad_id AND ads.user_id = auth.uid()
  )
);


-- 3. Atualizar a Função de Incremento de Views Segura
-- Vamos atualizar a função increment_ad_view_safe para preencher o diário
CREATE OR REPLACE FUNCTION increment_ad_view_safe(p_ad_id UUID)
RETURNS void AS $$
BEGIN
  -- 1. Incrementa o total no anúncio
  UPDATE ads
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_ad_id;

  -- 2. Incrementa o diário (Upsert)
  INSERT INTO ad_views_daily (ad_id, view_date, views_count)
  VALUES (p_ad_id, CURRENT_DATE, 1)
  ON CONFLICT (ad_id, view_date)
  DO UPDATE SET views_count = ad_views_daily.views_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
