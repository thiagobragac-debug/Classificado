-- ============================================================================
--  Finalidade do anúncio (ads.purpose) — campo opcional, só para categorias
--  de animais (Bovinos/Equinos/Suínos/Caprinos/Ovinos)
-- ============================================================================
--
--  Não é uma tabela normalizada: os valores válidos por categoria são um
--  conjunto pequeno e fixo (ex.: Bovinos = Corte/Leite/Dupla Aptidão/
--  Reprodução), mantido em código (lib/purposeOptions.ts), não no banco —
--  mesmo padrão já usado para `condition` (novo/usado) e `price_unit_pt`,
--  que também são strings livres validadas só na UI, sem tabela de apoio.
-- ============================================================================

ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS purpose text;
