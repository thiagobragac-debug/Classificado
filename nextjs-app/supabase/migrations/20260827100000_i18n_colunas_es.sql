-- ============================================================================
--  Colunas em espanhol faltando — auditoria completa de i18n, 2026-08-26/27
-- ============================================================================
--
--  A auditoria confirmou (149 achados, praticamente nada refutado) que boa
--  parte do site nunca teve nenhuma coluna _es pra escolher, mesmo se o
--  frontend fosse corrigido pra tentar. `ads`/`categories` já tinham o
--  padrão bilíngue correto (title_pt/title_es, name_pt/name_es) — esta
--  migration estende o MESMO padrão pras tabelas que nunca tiveram.
--
--  Todas as colunas são opcionais (nullable) — o código deve continuar
--  fazendo fallback pra coluna _pt quando _es estiver vazia, exatamente
--  como `ads.title_pt || ads.title_es` já faz hoje.
-- ============================================================================

alter table public.testimonials add column if not exists text_es text;

alter table public.eventos add column if not exists title_es text;
alter table public.eventos add column if not exists location_str_es text;
alter table public.eventos add column if not exists organizer_es text;

alter table public.auction_events add column if not exists title_es text;

alter table public.auction_lots add column if not exists title_es text;
alter table public.auction_lots add column if not exists sire_es text;
alter table public.auction_lots add column if not exists dam_es text;
alter table public.auction_lots add column if not exists description_es text;

alter table public.institutional_pages add column if not exists title_es text;
alter table public.institutional_pages add column if not exists subtitle_es text;
alter table public.institutional_pages add column if not exists content_es text;
alter table public.institutional_pages add column if not exists group_name_es text;

alter table public.plans add column if not exists name_es text;
alter table public.plans add column if not exists description_es text;
alter table public.plans add column if not exists features_es jsonb;

-- ads já tinha title_pt/title_es — faltavam price_unit e tags (campo livre
-- digitado pelo vendedor no wizard, nunca teve variante em espanhol).
alter table public.ads add column if not exists price_unit_es text;
alter table public.ads add column if not exists tags_es text[];
