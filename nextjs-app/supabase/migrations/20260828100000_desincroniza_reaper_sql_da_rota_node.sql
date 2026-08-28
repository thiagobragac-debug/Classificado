-- ============================================================================
--  Desincroniza o reaper SQL (expire_stale_pending_subscriptions) da rota
--  Node (/api/internal/expire-stale-subscriptions), rodada 6 - revisão
--  adversarial da revalidação do zero
-- ============================================================================
--
--  ACHADO (reproduzido ao vivo, com prova de timestamp): a rota Node nova
--  (criada nesta mesma rodada, ver app/api/internal/expire-stale-subscriptions/
--  route.ts) foi desenhada pra cancelar de verdade no gateway ANTES de marcar
--  uma assinatura 'pending' velha como 'expired' — mas o job SQL já existente
--  (expire_stale_pending_subscriptions, criado na migration
--  20260826130000_correcoes_revisao_fixes_4a_rodada.sql) usa o MESMO limiar de
--  15 minutos e roda mais rápido (dentro do próprio Postgres, sem round-trip
--  de rede nem chamada a gateway externo — confirmado ao vivo: execuções de
--  5 a 20 milissegundos) e mais frequente (*/5 min vs. */10 min da rota Node).
--  Resultado comprovado ao vivo, com dado de teste real: uma assinatura
--  'pending' com gateway_subscription_id de verdade foi expirada pelo job SQL
--  no timestamp exato da execução dele, sem NENHUMA tentativa de cancelamento
--  no gateway — a rota Node nunca teve chance de competir. Como existe um
--  índice único parcial (subscriptions_user_pending_lock) que só libera um
--  novo checkout depois que a linha 'pending' anterior deixa de existir nesse
--  status, esse comportamento pode levar deterministicamente a cobrança
--  duplicada real (usuário tenta de novo, cria uma segunda assinatura, a
--  primeira nunca foi cancelada no gateway).
--
--  CORREÇÃO: o job SQL passa a ser uma rede de segurança de ÚLTIMO RECURSO
--  (limiar bem maior, 60 minutos) em vez de competir ativamente com a rota
--  Node a cada 5 minutos. Isso dá à rota Node (limiar de 15 min, agendada a
--  cada 10 min no vercel.json) várias janelas reais pra cancelar no gateway
--  antes que o job SQL simplesmente expire a linha sem cancelar nada.
-- ============================================================================

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
     and created_at < now() - interval '60 minutes';
end;
$$;

-- Mantém a mesma função/nome de job (só o corpo da função mudou, via CREATE OR
-- REPLACE acima) — não precisa recriar o agendamento do cron.job em si.
