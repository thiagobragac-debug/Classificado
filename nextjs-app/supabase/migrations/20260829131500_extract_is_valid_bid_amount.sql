-- BUG DE MANUTENÇÃO CORRIGIDO (fechamento pré-produção): a guarda contra NaN
-- (migration 20260829121500) estava duplicada, idêntica, em
-- place_bid_atomic e place_lot_bid_atomic. Extraída pra uma função só, no
-- mesmo espírito de flattenOne() no TS — uma 3ª função de lance futura (ou
-- qualquer outro RPC que aceite valor monetário do cliente) reusa isso em
-- vez de reimplementar a checagem (e arriscar repetir o erro original de
-- usar `p_amount != p_amount`, já corrigido e documentado ali).
create or replace function public.is_valid_bid_amount(p_amount numeric)
 returns boolean
 language sql
 immutable
as $function$
  select p_amount is not null and p_amount <> 'NaN'::numeric and p_amount > 0;
$function$;

revoke all on function public.is_valid_bid_amount(numeric) from public;
grant execute on function public.is_valid_bid_amount(numeric) to authenticated;

create or replace function public.place_bid_atomic(p_auction_id uuid, p_amount numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id   uuid := auth.uid();
  v_auction   record;
  v_bid_id    uuid;
  v_min_valid numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Não autenticado');
  end if;

  if not is_valid_bid_amount(p_amount) then
    return jsonb_build_object('success', false, 'error', 'Valor do lance inválido.');
  end if;

  select a.*, ad.user_id as seller_id
    into v_auction
    from auctions a
    join ads ad on ad.id = a.ad_id
   where a.id = p_auction_id
     for update of a;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  end if;

  if v_auction.status <> 'live' then
    return jsonb_build_object('success', false, 'error', 'Leilão não está ao vivo');
  end if;

  if v_auction.end_at < now() then
    return jsonb_build_object('success', false, 'error', 'Leilão expirado');
  end if;

  if v_user_id = v_auction.seller_id then
    return jsonb_build_object('success', false, 'error', 'Vendedor não pode dar lances no próprio leilão');
  end if;

  v_min_valid := coalesce(v_auction.current_bid, v_auction.start_price) + v_auction.min_increment;
  if p_amount < v_min_valid then
    return jsonb_build_object(
      'success', false,
      'error', format('Lance deve ser de pelo menos %s', v_min_valid),
      'min_valid', v_min_valid
    );
  end if;

  insert into auction_bids (auction_id, user_id, amount)
  values (p_auction_id, v_user_id, p_amount)
  returning id into v_bid_id;

  update auctions set current_bid = p_amount where id = p_auction_id;

  return jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount', p_amount);
exception when others then
  raise warning 'place_bid_atomic falhou para leilao %: %', p_auction_id, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Erro ao processar o lance. Tente novamente.');
end;
$function$;

create or replace function public.place_lot_bid_atomic(p_lot_id uuid, p_amount numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id   uuid := auth.uid();
  v_lot       record;
  v_bid_id    uuid;
  v_min_valid numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Não autenticado');
  end if;

  if not is_valid_bid_amount(p_amount) then
    return jsonb_build_object('success', false, 'error', 'Valor do lance inválido.');
  end if;

  select l.*, e.status as event_status, e.accepts_bids as event_accepts_bids, e.step as event_step
    into v_lot
    from auction_lots l
    join auction_events e on e.id = l.auction_id
   where l.id = p_lot_id
     for update of l;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Lote não encontrado');
  end if;

  if v_lot.event_status <> 'live' then
    return jsonb_build_object('success', false, 'error', 'Este leilão não está ao vivo');
  end if;

  if coalesce(v_lot.event_accepts_bids, true) = false then
    return jsonb_build_object('success', false, 'error', 'Este leilão não está aceitando lances no momento');
  end if;

  v_min_valid := coalesce(v_lot.current_bid, v_lot.min_bid, 0) + coalesce(v_lot.event_step, 0);
  if p_amount < v_min_valid then
    return jsonb_build_object(
      'success', false,
      'error', format('Lance deve ser de pelo menos %s', v_min_valid),
      'min_valid', v_min_valid
    );
  end if;

  insert into auction_lot_bids (lot_id, user_id, amount)
  values (p_lot_id, v_user_id, p_amount)
  returning id into v_bid_id;

  update auction_lots set current_bid = p_amount, winner_id = v_user_id where id = p_lot_id;

  return jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount', p_amount);
exception when others then
  raise warning 'place_lot_bid_atomic falhou para lote %: %', p_lot_id, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Erro ao processar o lance. Tente novamente.');
end;
$function$;
