-- ============================================================================
--  Achados da revisão independente dos 9 fixes da 4ª rodada de billing
-- ============================================================================

-- 1. O índice único parcial subscriptions_user_pending_lock (migration
--    anterior) fecha a corrida real entre checkoutIds diferentes — mas sem
--    nenhum reaper, uma linha 'pending' órfã (webhook que nunca chega, 3DS
--    abandonado, função serverless derrubada no meio do checkout) trocou um
--    bug de billing (cobrança dupla) por um bug de disponibilidade: a conta
--    INTEIRA fica travada de tentar assinar/trocar de plano de novo, pra
--    sempre, sem nenhuma recuperação automática. Confirmado ao vivo por 2
--    revisores independentes. Igual padrão já usado pra expire_ads/
--    advance_scheduled_auctions — 15 minutos é folgado o bastante pra
--    qualquer webhook real (segundos) sem deixar ninguém preso por muito
--    tempo.
create or replace function public.expire_stale_pending_subscriptions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions
     set status = 'expired', updated_at = now()
   where status = 'pending'
     and created_at < now() - interval '15 minutes';
end;
$$;

revoke execute on function public.expire_stale_pending_subscriptions() from public, anon, authenticated;

select cron.schedule(
  'expire-stale-pending-subscriptions',
  '*/5 * * * *',
  $$select public.expire_stale_pending_subscriptions()$$
);
