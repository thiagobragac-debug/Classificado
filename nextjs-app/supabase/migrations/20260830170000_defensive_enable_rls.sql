-- ============================================================================
--  RLS reafirmada defensivamente em tabelas sem ENABLE ROW LEVEL SECURITY
--  rastreado no histórico
-- ============================================================================
--
--  PROBLEMA (re-auditoria de segurança, 2026-08-30, achado crítico/alto)
--
--  A migration 20260830160000 (platform_settings) recriou só a POLICY,
--  assumindo que RLS já estava habilitada na tabela — mas nenhuma migration
--  deste repositório contém `ALTER TABLE public.platform_settings ENABLE ROW
--  LEVEL SECURITY`. Se, por qualquer motivo, esse bit estiver desligado em
--  produção, a policy inteira é irrelevante: como não há nenhum REVOKE de
--  privilégio de tabela em platform_settings (ao contrário do que foi feito
--  pra profiles), anon/authenticated teriam GRANT padrão do Supabase e
--  leriam os 8 segredos de gateway em texto puro via REST público, sem
--  sessão nenhuma.
--
--  A mesma lacuna de auditabilidade (RLS referenciada em policies, nunca
--  confirmada como habilitada em nenhuma migration) existe pra outras 8
--  tabelas sensíveis: api_keys, categories, banners, plans, testimonials,
--  reports, auction_lots, institutional_pages.
--
--  SOLUÇÃO
--
--  `ENABLE ROW LEVEL SECURITY` é idempotente — não é erro, e não muda
--  comportamento algum, se a tabela já estiver com RLS ligada (é exatamente
--  o padrão já usado em 20260830160100 pra messages e em 20260825150400
--  pra coupons). Reafirmar aqui fecha a lacuna de auditabilidade nos dois
--  cenários: se já estava ligada, isto é só documentação; se não estava,
--  isto é a correção real de uma exposição crítica.
-- ============================================================================

alter table public.platform_settings   enable row level security;
alter table public.api_keys            enable row level security;
alter table public.categories          enable row level security;
alter table public.banners             enable row level security;
alter table public.plans               enable row level security;
alter table public.testimonials        enable row level security;
alter table public.reports             enable row level security;
alter table public.auction_lots        enable row level security;
alter table public.institutional_pages enable row level security;
