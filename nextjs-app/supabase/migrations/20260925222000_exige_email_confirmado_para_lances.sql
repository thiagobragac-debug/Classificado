-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25,
-- verificado adversarialmente 3x sem refutação): place_bid_atomic e
-- place_lot_bid_atomic só exigem uma sessão válida (auth.uid() != null) —
-- nenhum dos dois checa email_confirmed_at, diferente de
-- app/api/contact-seller/route.ts, que foi deliberadamente corrigido pra
-- exigir e-mail confirmado exatamente pela mesma classe de abuso (contas
-- descartáveis, self-service, sem CAPTCHA bloqueando o cadastro em si — só
-- o e-mail nunca é confirmado). Sem esta checagem, um atacante pode criar
-- quantas contas quiser (cada uma passando o Turnstile de cadastro
-- normalmente) para dar lances de sombra (shill bidding) num leilão ao
-- vivo, inflar o preço contra um comprador real, ou vencer um leilão sem
-- nunca ter uma identidade rastreável.
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

  if not exists (select 1 from auth.users where id = v_user_id and email_confirmed_at is not null) then
    return jsonb_build_object('success', false, 'error', 'Confirme seu e-mail antes de dar lances.');
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
as $$
declare
  v_user_id   uuid := auth.uid();
  v_lot       record;
  v_bid_id    uuid;
  v_min_valid numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Não autenticado');
  end if;

  if not exists (select 1 from auth.users where id = v_user_id and email_confirmed_at is not null) then
    return jsonb_build_object('success', false, 'error', 'Confirme seu e-mail antes de dar lances.');
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

  v_min_valid := coalesce(v_lot.current_bid, v_lot.min_bid, 0) + greatest(coalesce(v_lot.event_step, 0), 0.01);
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
$$;
