-- ============================================================================
--  Fecha 2 brechas na tabela/RPCs de cupons de desconto
-- ============================================================================
--
--  PROBLEMA 1 — RLS de `coupons` liberada pra qualquer autenticado
--
--  A policy real em produção é "Enable all access for authenticated users
--  only" (cmd=ALL, qual = auth.role()='authenticated') — diferente de
--  `plans`/`platform_settings`, que usam is_admin() pro mesmo tipo de tela
--  administrável. Qualquer comprador logado podia criar seu próprio cupom de
--  100% off direto pelo console do navegador, sem nunca abrir /admin. Havia
--  também uma policy de SELECT aberta a `anon` — qualquer visitante sem
--  login conseguia listar todos os cupons, ativos ou não.
--
--  PROBLEMA 2 — RPCs de cupom sem checar quem chama
--
--  try_apply_coupon/revert_coupon_usage são SECURITY DEFINER, recebem só um
--  uuid de cupom, e tinham EXECUTE liberado pra PUBLIC/anon/authenticated —
--  mesma classe de bug já corrigida em place_bid_atomic/toggle_favorite_atomic
--  (20260823140000), nunca replicada aqui. Um terceiro podia esgotar
--  usage_count de um cupom alheio (nega a clientes reais) ou zerá-lo de volta
--  (permite resgates ilimitados). O único chamador legítimo é
--  app/api/checkout/route.ts, que já usa o client de service_role.
--
--  CORREÇÃO
--
--  RLS de `coupons` fica admin-only pra tudo (leitura inclusa — o admin já
--  lista tudo via a própria sessão, protegida por is_admin()). O preview de
--  cupom no checkout (CheckoutModal "Aplicar cupom") deixa de ler a tabela
--  direto e passa a chamar uma rota de servidor nova (ver commit de código
--  junto desta migration) — o mesmo padrão que /api/checkout já usa pra
--  validar o cupom de verdade antes de cobrar.
-- ============================================================================

drop policy if exists "Enable all access for authenticated users only" on public.coupons;
drop policy if exists "Enable read access for all users" on public.coupons;

alter table public.coupons enable row level security;

create policy "Admins gerenciam cupons"
on public.coupons for all
using (public.is_admin())
with check (public.is_admin());

revoke execute on function public.try_apply_coupon(uuid) from public, anon, authenticated;
grant execute on function public.try_apply_coupon(uuid) to service_role;

revoke execute on function public.revert_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.revert_coupon_usage(uuid) to service_role;
