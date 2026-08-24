-- FUNCIONALIDADE NOVA: sistema de lances por lote (auction_lots), pedido
-- pelo usuário depois de descobrir, testando de ponta a ponta, que o
-- "Leilão Virtual" (auction_events + auction_lots — o único visível no
-- site em /leiloes) nunca teve backend de lances. A tela
-- (components/auctions/LotBiddingModal.tsx) chama place_bid_atomic, uma
-- função pronta de um sistema TOTALMENTE separado e não relacionado —
-- leilão de anúncio individual (auctions/auction_bids, auction_id
-- referencia ads via a coluna ad_id). auction_lots.auction_id referencia
-- auction_events, não auctions — por isso todo lance real falhava com
-- "Leilão não encontrado" (confirmado chamando a função de verdade).
--
-- Esta migration espelha o design já existente de auctions/auction_bids/
-- place_bid_atomic, adaptado para o vocabulário de eventos+lotes:
--   auctions        -> auction_events (já existia)
--   auction_bids    -> auction_lot_bids (nova)
--   current_bid/winner_id em auctions -> idem em auction_lots (novas colunas)
--   min_increment em auctions         -> auction_events.step (já existia,
--                                        só não era usado em lugar nenhum)
--
-- Sem verificação de "vendedor não pode dar lance no próprio leilão": ao
-- contrário de auctions (ligado a um ad de um vendedor específico),
-- auction_events não tem coluna de proprietário/vendedor — são eventos
-- geridos pela própria plataforma, não por um usuário individual.

alter table public.auction_lots
  add column if not exists current_bid numeric,
  add column if not exists winner_id uuid references public.profiles(id);

create table if not exists public.auction_lot_bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.auction_lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists auction_lot_bids_lot_id_idx on public.auction_lot_bids(lot_id);

alter table public.auction_lot_bids enable row level security;

drop policy if exists "Lances de lote são públicos" on public.auction_lot_bids;
create policy "Lances de lote são públicos" on public.auction_lot_bids
  for select
  using (true);

-- INSERT só é feito de dentro de place_lot_bid_atomic (security definer),
-- mas mantém a mesma policy de auction_bids por consistência e para
-- permitir chamada direta se algum dia for necessário.
drop policy if exists "Usuário insere lance no próprio nome" on public.auction_lot_bids;
create policy "Usuário insere lance no próprio nome" on public.auction_lot_bids
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Admins gerenciam lances de lote" on public.auction_lot_bids;
create policy "Admins gerenciam lances de lote" on public.auction_lot_bids
  for all
  using (is_admin())
  with check (is_admin());

create or replace function public.place_lot_bid_atomic(p_lot_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
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
$$;

-- Bônus: mesma classe de bug (profiles.is_admin, nunca setado por nenhum
-- fluxo real) encontrada de passagem nas policies de UPDATE/DELETE de
-- auction_bids — o sistema irmão desta migration. Corrigindo já que a
-- causa raiz e a função certa (is_admin()) já estão na mesma migration.
drop policy if exists "Apenas admin deleta lances" on public.auction_bids;
drop policy if exists "Apenas admin modifica ou deleta lances" on public.auction_bids;
create policy "Admins gerenciam lances" on public.auction_bids
  for all
  using (is_admin())
  with check (is_admin());
