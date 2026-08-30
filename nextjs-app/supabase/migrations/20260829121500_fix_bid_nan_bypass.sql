-- BUG CRÍTICO CORRIGIDO (varredura de segurança, "travas de sistema",
-- 2026-08-29): place_bid_atomic e place_lot_bid_atomic validavam o valor do
-- lance só com `if p_amount < v_min_valid then rejeita`. O tipo `numeric` do
-- Postgres aceita o literal especial 'NaN', que por definição de ordenação
-- total é MAIOR que qualquer valor finito — então `NaN < v_min_valid` é
-- FALSO, o lance passa, e current_bid/current_bid do lote vira NaN.
--
-- Confirmado AO VIVO antes desta migration (POST direto em
-- /rest/v1/rpc/place_lot_bid_atomic com {"p_amount": "NaN"}, contornando o
-- isFinite() que só existe no wrapper client-side em lib/supabase.ts):
-- o lance foi aceito (success:true), current_bid virou 'NaN', e TODO lance
-- seguinte (inclusive valores altos, tipo 999999) passou a ser rejeitado
-- com "Lance deve ser de pelo menos NaN" — porque NaN + qualquer coisa
-- também é NaN, e `finito < NaN` é sempre verdadeiro. Ou seja: um único
-- lance NaN destrói o leilão/lote permanentemente pra qualquer lance futuro
-- (nenhum, alto ou baixo, volta a ser aceito), com o atacante registrado
-- como "vencedor" a um preço que nunca existiu.
--
-- Comparação direta com o literal 'NaN'::numeric é o jeito certo de detectar
-- isso — ao contrário do IEEE 754 (onde NaN != NaN), o tipo `numeric` do
-- Postgres define deliberadamente NaN = NaN (documentado: "PostgreSQL
-- treats NaN as equal, and greater than all non-NaN values", justamente
-- pra permitir ordenação/índice) — confirmado ao vivo com
-- `select 'NaN'::numeric = 'NaN'::numeric`, que devolve true. A primeira
-- tentativa desta correção usou `p_amount != p_amount` (o idioma certo
-- para float8, errado aqui) e não pegou o ataque quando retestado — por
-- isso a comparação explícita com o literal. Guarda logo após a checagem
-- de autenticação, antes de qualquer leitura/trava de linha.

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

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 then
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

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 then
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
