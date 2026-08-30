-- ============================================================================
--  Subcategorias de animais: finalidade/fase de vida -> raça
-- ============================================================================
--
--  As subcategorias originais de Bovinos/Equinos/Suínos/Caprinos/Ovinos
--  misturavam dois critérios diferentes sem coerência (raça em Equinos,
--  finalidade/fase de vida nas demais). Para o agro brasileiro, RAÇA é o
--  eixo de busca mais valioso nessas categorias (mais até que corte/leite,
--  que já fica implícito pela raça na maioria dos casos). Substituindo por
--  raça aqui; finalidade vira um campo próprio do anúncio (ads.purpose,
--  ver 20260829100100_adiciona_purpose_em_ads.sql), não subcategoria.
--
--  Confirmado antes desta migration: nenhum anúncio real referencia as
--  subcategorias antigas dessas 5 categorias (site lançou a feature há
--  poucas horas) — a troca é segura.
-- ============================================================================

DELETE FROM public.subcategories WHERE category_id IN ('cat-bovinos', 'cat-equinos', 'cat-suinos', 'caprinos', 'cat-ovinos');

INSERT INTO public.subcategories (id, category_id, name_pt, name_es, active, sort_order) VALUES
('sub-bovinos-nelore', 'cat-bovinos', 'Nelore', 'Nelore', true, 1),
('sub-bovinos-angus', 'cat-bovinos', 'Angus', 'Angus', true, 2),
('sub-bovinos-brangus', 'cat-bovinos', 'Brangus', 'Brangus', true, 3),
('sub-bovinos-brahman', 'cat-bovinos', 'Brahman', 'Brahman', true, 4),
('sub-bovinos-senepol', 'cat-bovinos', 'Senepol', 'Senepol', true, 5),
('sub-bovinos-tabapua', 'cat-bovinos', 'Tabapuã', 'Tabapuá', true, 6),
('sub-bovinos-guzera', 'cat-bovinos', 'Guzerá', 'Guzerá', true, 7),
('sub-bovinos-girolando', 'cat-bovinos', 'Girolando', 'Girolando', true, 8),
('sub-bovinos-holandes', 'cat-bovinos', 'Holandês', 'Holando', true, 9),
('sub-bovinos-jersey', 'cat-bovinos', 'Jersey', 'Jersey', true, 10),
('sub-bovinos-mestico-srd', 'cat-bovinos', 'Mestiço/SRD', 'Mestizo/SRD', true, 11),

('sub-equinos-quarto-de-milha', 'cat-equinos', 'Quarto de Milha', 'Cuarto de Milla', true, 1),
('sub-equinos-crioulo', 'cat-equinos', 'Crioulo', 'Criollo', true, 2),
('sub-equinos-mangalarga-marchador', 'cat-equinos', 'Mangalarga Marchador', 'Mangalarga Marchador', true, 3),
('sub-equinos-campolina', 'cat-equinos', 'Campolina', 'Campolina', true, 4),
('sub-equinos-puro-sangue-ingles', 'cat-equinos', 'Puro Sangue Inglês', 'Pura Sangre Inglés', true, 5),
('sub-equinos-brasileiro-de-hipismo', 'cat-equinos', 'Brasileiro de Hipismo', 'Brasileño de Hipismo', true, 6),
('sub-equinos-ponei', 'cat-equinos', 'Pônei', 'Poni', true, 7),

('sub-suinos-large-white', 'cat-suinos', 'Large White', 'Large White', true, 1),
('sub-suinos-landrace', 'cat-suinos', 'Landrace', 'Landrace', true, 2),
('sub-suinos-duroc', 'cat-suinos', 'Duroc', 'Duroc', true, 3),
('sub-suinos-pietrain', 'cat-suinos', 'Pietrain', 'Pietrain', true, 4),
('sub-suinos-comercial-hibrido', 'cat-suinos', 'Comercial/Híbrido', 'Comercial/Híbrido', true, 5),

('sub-caprinos-boer', 'caprinos', 'Boer', 'Boer', true, 1),
('sub-caprinos-saanen', 'caprinos', 'Saanen', 'Saanen', true, 2),
('sub-caprinos-anglo-nubiana', 'caprinos', 'Anglo-Nubiana', 'Anglo-Nubiana', true, 3),
('sub-caprinos-toggenburg', 'caprinos', 'Toggenburg', 'Toggenburg', true, 4),
('sub-caprinos-parda-alpina', 'caprinos', 'Parda Alpina', 'Alpina Parda', true, 5),
('sub-caprinos-moxoto-caninde', 'caprinos', 'Moxotó/Canindé', 'Moxotó/Canindé', true, 6),
('sub-caprinos-srd', 'caprinos', 'SRD', 'SRD', true, 7),

('sub-ovinos-santa-ines', 'cat-ovinos', 'Santa Inês', 'Santa Inés', true, 1),
('sub-ovinos-dorper', 'cat-ovinos', 'Dorper', 'Dorper', true, 2),
('sub-ovinos-texel', 'cat-ovinos', 'Texel', 'Texel', true, 3),
('sub-ovinos-suffolk', 'cat-ovinos', 'Suffolk', 'Suffolk', true, 4),
('sub-ovinos-ile-de-france', 'cat-ovinos', 'Île de France', 'Ile de France', true, 5),
('sub-ovinos-morada-nova', 'cat-ovinos', 'Morada Nova', 'Morada Nova', true, 6),
('sub-ovinos-srd', 'cat-ovinos', 'SRD', 'SRD', true, 7);
