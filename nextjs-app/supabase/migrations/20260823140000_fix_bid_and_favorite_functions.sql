-- ============================================================================
--  place_bid_atomic e toggle_favorite_atomic — reescritas
-- ============================================================================
--
--  ORIGEM DO ACHADO
--
--  Nenhuma das duas tinha migration (checklist, item 11). Recuperei o código-
--  fonte de produção via Management API (pg_get_functiondef) e revisei. As
--  duas estavam quebradas por schema drift — a tabela mudou depois que a
--  função foi escrita e ninguém atualizou a função — e as duas confiavam num
--  parâmetro de identidade vindo do cliente em vez de `auth.uid()`.
--
--  1. place_bid_atomic ESTÁ QUEBRADA EM PRODUÇÃO AGORA — feature "Leilões Ao
--     Vivo" inteira não funciona
--
--     Verificado invocando a função de verdade contra um leilão de teste
--     isolado (nenhum leilão real tocado):
--
--       {"error":"invalid input value for enum auction_status: \"active\"","success":false}
--
--     auction_status só aceita 'scheduled' | 'live' | 'ended' | 'canceled' —
--     nunca existiu valor 'active'. A função comparava `status != 'active'`,
--     então TODO lance falha nessa linha, sempre. lib/supabase.ts:placeBid()
--     não tem fallback (diferente de toggle_favorite_atomic, que tem) —
--     o usuário só via "Erro ao processar lance."
--
--     Além disso a função referenciava `v_auction.seller_id` e
--     `v_auction.ends_at`, colunas que não existem em `auctions` (a tabela
--     real tem `ad_id`, `start_at`, `end_at`; vendedor é `ads.user_id` via
--     join). Nunca seria alcançado hoje — o enum já barra antes —, mas
--     quebraria de novo assim que alguém corrigisse só o enum.
--
--     `min_increment` (coluna que já existe na tabela) nunca era conferido:
--     qualquer valor acima do lance atual era aceito, ignorando o incremento
--     mínimo configurado por leilão.
--
--  2. toggle_favorite_atomic também quebrada — mascarada por um fallback
--
--     Verificado com o mesmo padrão: chamada real retorna
--
--       operator does not exist: uuid = text
--
--     favorites.ad_id é uuid; a função declarava `p_ad_id text` e comparava
--     sem cast. TODA chamada falha. Não virou incidente visível porque
--     lib/supabase.ts:rpcToggleFav() tem `catch` com fallback que refaz a
--     operação via INSERT/DELETE direto — favoritar segue funcionando hoje,
--     só que sem a atomicidade que a função deveria garantir (janela de
--     corrida em duplo clique rápido).
--
--  3. As duas confiavam em p_user_id vindo do cliente, E as duas são
--     SECURITY DEFINER com EXECUTE liberado para `anon` (verificado em
--     information_schema.routine_privileges)
--
--     SECURITY DEFINER faz a função rodar com o privilégio de quem a
--     definiu, ignorando a RLS da tabela. E a RLS aqui está correta:
--
--       auction_bids: "Anyone can bid" (insert) — with_check (auth.uid() = user_id)
--       favorites:    "Gerenciamento total..." (all)  — qual (auth.uid() = user_id)
--
--     Ou seja: um INSERT direto via REST, sem passar pela função, já seria
--     barrado para um p_user_id forjado. A função SECURITY DEFINER contorna
--     exatamente essa proteção ao aceitar a identidade como parâmetro em vez
--     de derivar de auth.uid(). Combinado com anon poder chamar a RPC — sem
--     login nenhum —, qualquer pessoa com a anon key (pública por natureza)
--     poderia dar lance ou favoritar em nome de um usuário real, se soubesse
--     o UUID dele. Não é explorável HOJE só porque os bugs de schema acima
--     fazem a função falhar antes de chegar no INSERT — confirmado no mesmo
--     teste: 0 lances gravados. Mas corrigir só o schema sem corrigir isto
--     reabriria a mesma falha que a RLS foi escrita para prevenir.
--
--  A correção fecha os dois problemas juntos: corrige o schema E passa a
--  derivar a identidade de auth.uid() dentro da função, nunca de parâmetro.
--  SECURITY DEFINER continua sendo necessário — o bidder não tem UPDATE em
--  `auctions` pela própria RLS (só o dono do anúncio ou admin têm, pela
--  policy "Proprietários gerenciam leilões"), então a função PRECISA elevar
--  privilégio para atualizar current_bid em nome de quem não é o dono. O que
--  muda é que ela deixa de confiar no cliente para saber QUEM está agindo.
--
--  IMPORTANTE — muda a assinatura das duas funções (p_user_id sai dos
--  parâmetros). Isto cria uma nova função ao lado da antiga se só usar
--  CREATE OR REPLACE — por isso os DROP FUNCTION explícitos abaixo. Os
--  call sites em lib/supabase.ts foram atualizados no mesmo commit.
-- ============================================================================

drop function if exists public.place_bid_atomic(uuid, uuid, numeric);
drop function if exists public.toggle_favorite_atomic(uuid, text);

create or replace function public.place_bid_atomic(p_auction_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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
  -- SQLERRM não é mais devolvido ao cliente: detalhe de schema/erro interno
  -- não deveria vazar em uma função exposta a authenticated. Fica no log do
  -- Postgres via RAISE WARNING para quem precisar investigar.
  raise warning 'place_bid_atomic falhou para leilao %: %', p_auction_id, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Erro ao processar o lance. Tente novamente.');
end;
$function$;

create or replace function public.toggle_favorite_atomic(p_ad_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_exists  boolean;
begin
  if v_user_id is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select exists (
    select 1 from favorites where user_id = v_user_id and ad_id = p_ad_id
  ) into v_exists;

  if v_exists then
    delete from favorites where user_id = v_user_id and ad_id = p_ad_id;
    return false;
  else
    insert into favorites (user_id, ad_id) values (v_user_id, p_ad_id)
    on conflict (user_id, ad_id) do nothing;
    return true;
  end if;
end;
$function$;

-- anon nunca precisou dar lance nem favoritar — as duas ações exigem sessão.
-- PUBLIC inclui anon; revogar dos dois papéis deixa só quem está logado.
revoke execute on function public.place_bid_atomic(uuid, numeric) from public, anon;
grant  execute on function public.place_bid_atomic(uuid, numeric) to authenticated;

revoke execute on function public.toggle_favorite_atomic(uuid) from public, anon;
grant  execute on function public.toggle_favorite_atomic(uuid) to authenticated;
