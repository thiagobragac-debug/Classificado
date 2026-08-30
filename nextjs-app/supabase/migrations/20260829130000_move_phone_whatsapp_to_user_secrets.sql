-- GAP DE SEGURANÇA CORRIGIDO (fechamento pré-produção, achado residual da
-- varredura de segurança de 2026-08-29): profiles.phone_whatsapp tinha SELECT
-- revogado de `anon` (migration 20260829120000), mas continuava concedido a
-- `authenticated` — e a RLS de SELECT em profiles é
-- "Public profiles are viewable by everyone" (qual: true, roles: {public}).
-- RLS é só row-level: qualquer usuário logado (papel "authenticated", que
-- qualquer um ganha ao criar conta de graça) conseguia ler o telefone de
-- QUALQUER outro usuário direto via REST
-- (GET /rest/v1/profiles?select=phone_whatsapp&id=eq.<qualquer-id>).
--
-- A correção arquitetural (não um band-aid de policy) é mover a coluna pra
-- user_secrets, que já hospeda os outros campos sensíveis (email,
-- document_number, is_admin, is_blocked) sob uma RLS restritiva de verdade:
-- SELECT/UPDATE só onde id = auth.uid(). Isso alinha phone_whatsapp ao mesmo
-- modelo de segurança já usado por todo o resto do dado sensível do usuário,
-- em vez de inventar uma exceção só pra este campo.
--
-- O único caso legítimo de leitura CRUZADA (comprador vendo o telefone do
-- vendedor em /api/contact-seller) não pode ser resolvido por RLS (o
-- comprador nunca é auth.uid() = id do vendedor) — precisa de uma função
-- SECURITY DEFINER com sua própria checagem de autorização, no mesmo padrão
-- já usado por place_bid_atomic/place_lot_bid_atomic/check_rate_limit.

alter table public.user_secrets add column if not exists phone_whatsapp text;

update public.user_secrets us
   set phone_whatsapp = p.phone_whatsapp
  from public.profiles p
 where p.id = us.id
   and p.phone_whatsapp is not null
   and us.phone_whatsapp is null;

alter table public.profiles drop column if exists phone_whatsapp;

-- Função de acesso pro único caso de leitura cruzada legítima: comprador
-- pedindo o telefone do vendedor de um anúncio ATIVO. Autenticação e status
-- do anúncio são checados aqui dentro — não depende de nenhuma RLS de
-- profiles/user_secrets liberar leitura cruzada (elas continuam fechadas).
create or replace function public.get_seller_phone(p_ad_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id   uuid := auth.uid();
  v_seller_id uuid;
  v_phone     text;
begin
  if v_user_id is null then
    return null;
  end if;

  select ad.user_id into v_seller_id
    from ads ad
   where ad.id = p_ad_id
     and ad.status = 'active';

  if v_seller_id is null then
    return null;
  end if;

  select us.phone_whatsapp into v_phone
    from user_secrets us
   where us.id = v_seller_id;

  return v_phone;
end;
$function$;

-- `revoke ... from public` sozinho não bastava: o Supabase concede EXECUTE
-- em toda função nova de public diretamente a `anon` (fora do pseudo-papel
-- PUBLIC) — confirmado ao vivo (anon conseguia `can_exec=true` mesmo após o
-- revoke de PUBLIC). Precisa do revoke explícito de anon também, no mesmo
-- padrão de place_bid_atomic/place_lot_bid_atomic (authenticated=true,
-- anon=false).
revoke all on function public.get_seller_phone(uuid) from public;
revoke execute on function public.get_seller_phone(uuid) from anon;
grant execute on function public.get_seller_phone(uuid) to authenticated;
