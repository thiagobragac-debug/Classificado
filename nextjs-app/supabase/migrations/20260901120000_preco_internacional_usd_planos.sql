-- ============================================================================
--  plans.price_usd / promotional_price_usd — preço internacional fixo
-- ============================================================================
--
--  CONTEXTO
--
--  A Stripe (gateway internacional) cobrava sempre em BRL, hardcoded em
--  lib/gateways/stripe.ts — um cliente argentino/uruguaio/paraguaio via
--  "R$79,00" na tela e era cobrado em Reais, convertido pela bandeira do
--  cartão dele na taxa/spread que ela quiser. Decisão do usuário (dono do
--  produto): não fazer conversão automática pela cotação do dia (ruim pra
--  assinatura recorrente — o valor mudaria a cada renovação), e sim permitir
--  cadastrar um preço "de tabela" fixo em USD por plano, editável no admin.
--
--  price_usd/promotional_price_usd nulos (padrão) preservam o comportamento
--  atual (cobra em BRL) — nada quebra para planos que o admin ainda não
--  configurou.
-- ============================================================================

alter table public.plans add column if not exists price_usd numeric;
alter table public.plans add column if not exists promotional_price_usd numeric;
