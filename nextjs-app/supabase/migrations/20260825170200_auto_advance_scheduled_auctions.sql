-- ============================================================================
--  Transição automática scheduled → live pra auction_events, via pg_cron
-- ============================================================================
--
--  PROBLEMA
--
--  A transição de status do Leilão Virtual (auction_events) é 100%
--  manual — só o clique do admin em "Iniciar Transmissão"/"Finalizar" muda
--  o status. A UI pública mostra contagem regressiva ("INICIA EM...")
--  dando a impressão de algo automático, mas se o admin esquecer de clicar
--  na hora, o evento fica preso em 'scheduled' — e place_lot_bid_atomic
--  exige status='live' pra aceitar lance, então ninguém consegue dar
--  lance mesmo com o horário anunciado já vencido. Já aconteceu no sistema
--  irmão (tabela `auctions`, legado): 2 registros ficaram presos em 'live'
--  por ~7-8 semanas depois do horário de término.
--
--  ESCOPO DELIBERADAMENTE LIMITADO: só scheduled → live
--
--  auction_events não tem (e não deveria ter) um horário de TÉRMINO —
--  "date" é só o início da transmissão ao vivo, e quando o leilão termina
--  depende do ritmo real da transmissão, decidido pelo leiloeiro no
--  momento. Automatizar live → closed exigiria inventar uma duração fixa
--  que não existe no produto — por isso esta migration só cobre a metade
--  que tem um horário real e conhecido pra comparar (scheduled → live).
--  "Finalizar" continua sendo uma decisão humana, como já é hoje.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

create or replace function public.advance_scheduled_auctions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.auction_events
     set status = 'live'
   where status = 'scheduled'
     and date <= now();
end;
$$;

select cron.schedule(
  'advance-scheduled-auctions',
  '*/5 * * * *',
  $$select public.advance_scheduled_auctions()$$
);
