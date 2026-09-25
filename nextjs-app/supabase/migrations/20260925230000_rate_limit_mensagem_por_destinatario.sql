-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25):
-- check_message_rate_limit() só contava por sender_id (20/hora), sem
-- considerar o receiver_id — um usuário podia escolher qualquer anúncio
-- ativo de uma vítima e mandar as 20 mensagens permitidas em poucos
-- segundos, todas pra ELA, um flood/assédio concentrado mesmo dentro do
-- teto global do remetente. Adiciona um segundo teto, por par
-- sender/receiver, mais apertado que o global — permite folgadamente uma
-- conversa real de ida e volta, mas barra concentrar o volume inteiro
-- num único destinatário.
create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  message_count int;
  receiver_count int;
begin
  select count(*)
    into message_count
    from messages
   where sender_id = new.sender_id
     and created_at >= now() - interval '1 hour';
  if message_count >= 20 then
    raise exception 'Rate limit exceeded: Você atingiu o limite de segurança de 20 mensagens por hora para evitar Spam. Aguarde para enviar novos contatos.';
  end if;

  select count(*)
    into receiver_count
    from messages
   where sender_id = new.sender_id
     and receiver_id = new.receiver_id
     and created_at >= now() - interval '1 hour';
  if receiver_count >= 8 then
    raise exception 'Rate limit exceeded: Você atingiu o limite de segurança de mensagens para este destinatário. Aguarde para enviar novas mensagens a ele(a).';
  end if;

  return new;
end;
$$;
