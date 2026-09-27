-- Promoção "50% OFF no primeiro ciclo" (mês ou ano, conforme billing_cycle) --
-- pedida ao vivo pelo usuário (27/set/2026) pra chamar atenção nos planos
-- pagos, com reajuste automático de volta ao preço cheio depois do 1o ciclo.
--
-- promo_full_price é um SNAPSHOT do preço cheio no momento do checkout (já
-- com o ajuste anual ×0.8×12 se aplicável) -- nunca recalculado a partir de
-- `plans` depois: o plano pode mudar de preço entre o checkout e a
-- renovação, e o que importa aqui é o que ESTE cliente pagaria normalmente.
--
-- promo_reajuste_last_attempted_at funciona como LEASE (não claim
-- destrutivo) entre o webhook de renovação e o cron de segurança
-- (reconcile-promo-pricing): se a chamada ao gateway falhar depois do
-- lease, promo_first_cycle_pending continua true -- perder esse sinal
-- deixaria o cliente pagando 50% pra sempre por engano, o oposto do
-- "máxima robustez" pedido.
alter table public.subscriptions
  add column if not exists promo_first_cycle_pending boolean not null default false,
  add column if not exists promo_full_price numeric,
  add column if not exists promo_reajuste_attempts integer not null default 0,
  add column if not exists promo_reajuste_last_error text,
  add column if not exists promo_reajuste_last_attempted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_promo_full_price_presente'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_promo_full_price_presente
      check (not promo_first_cycle_pending or promo_full_price is not null);
  end if;
end $$;

-- Índice parcial: a varredura do cron/webhook só olha pra linhas pendentes,
-- que devem ser sempre uma fração pequena da tabela.
create index if not exists subscriptions_promo_pending
  on public.subscriptions (id)
  where promo_first_cycle_pending = true;
