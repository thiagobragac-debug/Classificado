-- ============================================================================
--  Subcategorias de Imóveis Rurais: tipo de negócio -> tipo de imóvel
-- ============================================================================
--
--  Mesmo problema já corrigido nos animais: "Pastagens para Arrendamento"
--  misturava tipo de imóvel com tipo de negócio (venda vs. arrendamento)
--  dentro da mesma subcategoria. Subcategoria agora é só TIPO DE IMÓVEL;
--  venda/arrendamento vira um valor de `ads.purpose` (mesma coluna genérica
--  usada para finalidade de animais — ver lib/purposeOptions.ts), sem
--  precisar de coluna nova.
--
--  Confirmado antes desta migration: nenhum anúncio real referencia as
--  subcategorias antigas de Imóveis Rurais.
-- ============================================================================

DELETE FROM public.subcategories WHERE category_id = 'cat-imoveis';

INSERT INTO public.subcategories (id, category_id, name_pt, name_es, active, sort_order) VALUES
('sub-imoveis-fazendas', 'cat-imoveis', 'Fazendas', 'Estancias', true, 1),
('sub-imoveis-sitios-e-chacaras', 'cat-imoveis', 'Sítios e Chácaras', 'Chacras', true, 2),
('sub-imoveis-terrenos-agricolas', 'cat-imoveis', 'Terrenos Agrícolas', 'Terrenos Agrícolas', true, 3),
('sub-imoveis-pastagens', 'cat-imoveis', 'Pastagens', 'Pastos', true, 4),
('sub-imoveis-galpoes-e-armazens', 'cat-imoveis', 'Galpões e Armazéns', 'Galpones y Almacenes', true, 5);
