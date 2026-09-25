-- Infra de push notification (Fase 0 do plano de apps nativos separados
-- Android/iOS, aprovado em 2026-09-09). Hoje só existe push_subscriptions
-- (endpoint web-push/VAPID, usado só por
-- app/(public)/painel/_components/usePush.ts) — não existe NENHUMA tabela
-- nem mecanismo de ENVIO de push (confirmado: nenhum pacote web-push, nenhum
-- cron, nenhuma edge function que envie). device_push_tokens é a tabela nova
-- pra tokens FCM (Android) e APNs (iOS, nativo — decisão do usuário foi NÃO
-- rotear iOS via FCM/Firebase); os triggers abaixo chamam, via pg_net (novo
-- nesta migration — não usado em nenhuma migration anterior), a Edge
-- Function `push-dispatch` (supabase/functions/push-dispatch/) de forma
-- assíncrona quando mensagem/lance/status de anúncio mudam.
--
-- IMPORTANTE — nada disto envia push de verdade ainda: os apps nativos não
-- existem, e push-dispatch (código separado, ver Edge Function) só tem um
-- esqueleto até ter credenciais reais de FCM (service account) e APNs
-- (chave .p8) configuradas. Os triggers já ficam ativos porque são baratos
-- (pg_net é assíncrono, não bloqueia a transação) e o botão de segurança é
-- justamente o segredo do Vault não estar configurado ainda (ver PASSO
-- MANUAL abaixo) — enquanto isso, notify_push_dispatch só retorna sem fazer
-- nada.
--
-- PASSO MANUAL (não dá pra fazer por migration): depois de criar a Edge
-- Function push-dispatch e definir EDGE_CRON_SECRET nela (mesmo padrão de
-- notify-expiring-keys), rodar UMA VEZ no SQL Editor do painel Supabase:
--   select vault.create_secret('<mesmo valor do EDGE_CRON_SECRET>', 'push_dispatch_secret');

create extension if not exists pg_net with schema extensions;

-- ─── Tabela de tokens de dispositivo ────────────────────────────────────
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  push_provider text not null check (push_provider in ('fcm', 'apns')),
  -- BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): os dois CHECKs acima são
  -- independentes entre si — nada impedia platform='ios' com
  -- push_provider='fcm' (ou o inverso), contrariando a decisão documentada
  -- no topo desta migration (iOS nunca roteia via FCM/Firebase). Amarra a
  -- combinação na origem, em vez de confiar no client nunca errar.
  constraint device_push_tokens_platform_provider_check
    check ((platform = 'android' and push_provider = 'fcm') or (platform = 'ios' and push_provider = 'apns')),
  token text not null,
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- unique em token (não em user_id+token): o mesmo token físico nunca deveria
-- pertencer a dois usuários ao mesmo tempo — reinstalar/trocar de conta no
-- mesmo aparelho deve REASSOCIAR o token. NOTA (corrigida na auditoria ao
-- vivo de 2026-09-25): um client autenticado fazendo esse upsert direto
-- (insert ... on conflict (token) do update ...) via Postgrest NÃO funciona
-- como a frase acima sugeria — no caminho ON CONFLICT DO UPDATE, o Postgres
-- checa a policy de UPDATE (USING) contra a linha PRÉ-EXISTENTE antes de
-- aplicar o WITH CHECK na linha nova; como essa linha ainda pertence ao
-- usuário ANTERIOR, auth.uid() não bate e a RLS recusa com erro. Por isso
-- a reassociação precisa passar pela RPC rpc_claim_push_token() abaixo
-- (SECURITY DEFINER), não por um upsert direto do client.
create unique index if not exists device_push_tokens_token_idx on public.device_push_tokens(token);
create index if not exists device_push_tokens_user_id_active_idx on public.device_push_tokens(user_id) where revoked_at is null;

alter table public.device_push_tokens enable row level security;

drop policy if exists "Usuário gerencia os próprios tokens de push" on public.device_push_tokens;
create policy "Usuário gerencia os próprios tokens de push" on public.device_push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins veem todos os tokens de push" on public.device_push_tokens;
create policy "Admins veem todos os tokens de push" on public.device_push_tokens
  for select
  using (is_admin());

-- ─── RPC de reassociação de token (troca de conta no mesmo aparelho) ──────
-- SECURITY DEFINER pra poder reatribuir uma linha que hoje pertence a OUTRO
-- usuário (a policy de UPDATE dono-only bloquearia isso num upsert comum do
-- client, ver nota acima). auth.uid() vem do JWT validado do chamador, não
-- de parâmetro — não dá pra forjar de quem é a reivindicação.
create or replace function public.rpc_claim_push_token(
  p_token text,
  p_platform text,
  p_push_provider text,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  insert into public.device_push_tokens (user_id, platform, push_provider, token, app_version)
  values (v_user_id, p_platform, p_push_provider, p_token, p_app_version)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        push_provider = excluded.push_provider,
        app_version = excluded.app_version,
        revoked_at = null,
        last_seen_at = now();
end;
$function$;

revoke all on function public.rpc_claim_push_token(text, text, text, text) from public;
revoke execute on function public.rpc_claim_push_token(text, text, text, text) from anon;
grant execute on function public.rpc_claim_push_token(text, text, text, text) to authenticated;

-- ─── Disparo assíncrono pro push-dispatch (via pg_net + Vault) ─────────────
create or replace function public.notify_push_dispatch(p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'push_dispatch_secret'
   limit 1;

  -- Segredo ainda não configurado (ver PASSO MANUAL no topo desta migration)
  -- — não derruba a transação de quem inseriu a mensagem/lance/anúncio por
  -- causa disso, só não dispara o push ainda. Mesma filosofia defensiva do
  -- CRON_SECRET em notify-expiring-keys (nunca falhar "alto" por causa de
  -- notificação).
  if v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://rfzuzuobwuanmbrcthqe.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('event', p_event, 'payload', p_payload)
  );
exception
  -- BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): o gate acima só cobre o
  -- caso "secret ausente" — qualquer OUTRA falha aqui dentro (erro do
  -- pg_net, schema errado, rede, etc.) propagava como exceção normal pra
  -- fora desta função. Para o trigger de lance (trg_notify_new_bid,
  -- disparado de dentro de place_lot_bid_atomic), isso derrubava e revertia
  -- silenciosamente um LANCE VÁLIDO só porque o pipeline de notificação
  -- falhou — dinheiro/compromisso real do usuário perdido por causa de uma
  -- feature auxiliar. Notificação de push nunca pode ser motivo pra
  -- reverter a ação de negócio que a originou.
  when others then
    return;
end;
$function$;

revoke all on function public.notify_push_dispatch(text, jsonb) from public;
revoke execute on function public.notify_push_dispatch(text, jsonb) from anon, authenticated;

-- ─── Trigger: nova mensagem (chat comprador-vendedor) ──────────────────────
create or replace function public.trg_notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.notify_push_dispatch('new_message', jsonb_build_object(
    'message_id', new.id,
    'ad_id', new.ad_id,
    'sender_id', new.sender_id,
    'receiver_id', new.receiver_id
  ));
  return new;
end;
$function$;

revoke all on function public.trg_notify_new_message() from public;
revoke execute on function public.trg_notify_new_message() from anon, authenticated;

drop trigger if exists notify_push_on_new_message on public.messages;
create trigger notify_push_on_new_message
  after insert on public.messages
  for each row execute function public.trg_notify_new_message();

-- ─── Trigger: lance superado (leilão de lote) ──────────────────────────────
-- Dispara em AFTER INSERT de auction_lot_bids, que dentro de
-- place_lot_bid_atomic acontece ANTES do UPDATE que sobrescreve
-- auction_lots.winner_id/current_bid (confirmado lendo a função ao vivo,
-- 2026-09-09) — ou seja, no momento deste trigger, auction_lots.winner_id
-- AINDA é o vencedor ANTERIOR ao lance que acabou de entrar. É exatamente
-- quem precisa ser avisado que foi superado.
create or replace function public.trg_notify_new_bid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_previous_winner_id uuid;
begin
  select winner_id into v_previous_winner_id
    from public.auction_lots
   where id = new.lot_id;

  if v_previous_winner_id is not null and v_previous_winner_id <> new.user_id then
    perform public.notify_push_dispatch('outbid', jsonb_build_object(
      'lot_id', new.lot_id,
      'previous_bidder_id', v_previous_winner_id,
      'new_bidder_id', new.user_id,
      'new_amount', new.amount
    ));
  end if;

  return new;
end;
$function$;

revoke all on function public.trg_notify_new_bid() from public;
revoke execute on function public.trg_notify_new_bid() from anon, authenticated;

drop trigger if exists notify_push_on_new_bid on public.auction_lot_bids;
create trigger notify_push_on_new_bid
  after insert on public.auction_lot_bids
  for each row execute function public.trg_notify_new_bid();

-- ─── Trigger: status de anúncio mudou (aprovado/rejeitado/etc.) ────────────
create or replace function public.trg_notify_ad_status_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    perform public.notify_push_dispatch('ad_status_changed', jsonb_build_object(
      'ad_id', new.id,
      'user_id', new.user_id,
      'old_status', old.status,
      'new_status', new.status
    ));
  end if;
  return new;
end;
$function$;

revoke all on function public.trg_notify_ad_status_changed() from public;
revoke execute on function public.trg_notify_ad_status_changed() from anon, authenticated;

drop trigger if exists notify_push_on_ad_status_change on public.ads;
create trigger notify_push_on_ad_status_change
  after update of status on public.ads
  for each row execute function public.trg_notify_ad_status_changed();
