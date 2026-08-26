-- ============================================================================
--  10 correções da 3ª rodada de validação do zero (2026-08-26), todas
--  adversarialmente verificadas antes de aplicar
-- ============================================================================

-- 1. guard_ad_moderation bloqueava reativação de anúncio pausado pelo
--    próprio dono. A regra "pular a fila de moderação é proibido" (correta
--    pra pending→active e rejected→active) também pegava paused→active —
--    mas 'paused' é um anúncio JÁ aprovado, pausado pelo próprio vendedor
--    (ex.: pra abrir vaga na cota do plano Grátis). Reativar deveria ser
--    self-service, não reentrar na fila. Só libera quando é uma troca de
--    status PURA (nenhum outro campo mudou junto) — reativar e editar
--    conteúdo ao mesmo tempo ainda cai na regra de moderação normal.
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active'::public.ad_status then
      raise exception
        'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- BUG CORRIGIDO (validação do zero, 3ª rodada): reativação pura
  -- (paused→active, sem mais nada mudando) é self-service.
  if new.status = 'active'::public.ad_status and old.status = 'paused'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','status'])
       is distinct from
       (to_jsonb(old) - array['updated_at','status'])
    then
      raise exception
        'ads: reativar e editar ao mesmo tempo requer nova moderacao. Salve a edicao separadamente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'active'::public.ad_status and old.status is distinct from 'active'::public.ad_status then
    raise exception
      'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
      using errcode = '42501';
  end if;

  if old.status = 'active'::public.ad_status and new.status = 'active'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
    then
      raise exception
        'ads: editar anuncio ativo requer nova moderacao. Envie o status para pending.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────

-- 2. enforce_plan_expiration lia profiles.plan — coluna que NENHUM caminho
--    de código atual escreve (checkout/webhook só gravam user_secrets.plan).
--    Este "freio de segurança" nunca disparava pra nenhuma assinatura real.
--    Agora lê o plano de user_secrets (fonte real) e também limpa
--    user_secrets.plan_id ao expirar — sem isso, os triggers de ads
--    (guard_ad_featured, enforce_ad_media_plan_limits, que fazem JOIN em
--    user_secrets.plan_id) continuariam aplicando os limites do plano
--    antigo mesmo depois do usuário "expirado".
create or replace function public.enforce_plan_expiration(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan text;
  v_expires_at timestamp with time zone;
  v_max_ads integer;
  v_excess_ids uuid[];
begin
  select us.plan, p.plan_expires_at into v_plan, v_expires_at
  from public.profiles p
  join public.user_secrets us on us.id = p.id
  where p.id = p_user_id;

  if v_plan is not null and v_plan != 'free' and v_expires_at is not null and v_expires_at < now() then
    update public.profiles
    set plan = 'free',
        plan_id = null,
        subscription_status = 'expired',
        plan_expires_at = null
    where id = p_user_id;

    update public.user_secrets
    set plan = 'free',
        plan_id = null
    where id = p_user_id;

    update public.subscriptions
    set status = 'expired',
        updated_at = now()
    where user_id = p_user_id and status in ('active', 'past_due');

    select max_ads into v_max_ads
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;

    if v_max_ads is not null then
      select array_agg(id) into v_excess_ids
        from (
          select id
            from public.ads
           where user_id = p_user_id
             and status = 'active'::public.ad_status
           order by created_at asc
           offset v_max_ads
        ) excess;

      if v_excess_ids is not null then
        update public.ads
           set status = 'paused'::public.ad_status, updated_at = now()
         where id = any(v_excess_ids);
      end if;
    end if;
  end if;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────

-- 3. enforce_ad_quota era o único dos 4 triggers de ads sem bypass de
--    admin/service_role — travava o admin tentando aprovar um único
--    anúncio pendente de um vendedor que já está no teto do próprio plano,
--    sem nenhum caminho de override na tela.
create or replace function public.enforce_ad_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max   integer;
  v_count integer;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.status::text is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status::text = 'active' then
      return new;
    end if;
  end if;

  select p.max_ads
    into v_max
    from public.user_secrets us
    left join public.plans p on p.id::text = us.plan_id
   where us.id = new.user_id;

  if v_max is null then
    select max_ads
      into v_max
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;
  end if;

  if v_max is null then
    return new;
  end if;

  select count(*)
    into v_count
    from public.ads
   where user_id = new.user_id
     and status::text = 'active'
     and id <> new.id;

  if v_count >= v_max then
    raise exception
      'Limite de % anuncios ativos do seu plano atingido. Pause um anuncio ou faca upgrade.', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────

-- 4. ads.expires_at nunca era conferido em lugar nenhum — 12 anúncios com
--    prazo vencido continuavam status='active', visíveis em toda listagem
--    pública e ainda ocupando vaga na cota do plano. Mesmo padrão de
--    pg_cron já usado pra leilões (advance_scheduled_auctions).
create or replace function public.expire_ads()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ads
     set status = 'expired'::public.ad_status, updated_at = now()
   where status = 'active'::public.ad_status
     and expires_at is not null
     and expires_at < now();
end;
$$;

revoke execute on function public.expire_ads() from public, anon, authenticated;

select cron.schedule(
  'expire-ads',
  '*/15 * * * *',
  $$select public.expire_ads()$$
);

-- ────────────────────────────────────────────────────────────────────────

-- 5. place_lot_bid_atomic (leilões de lote, 24/08) ficou de fora do REVOKE
--    que toda função SECURITY DEFINER nova daquele período recebeu — não é
--    explorável hoje (a função barra com "Não autenticado" pra chamada
--    anônima), mas quebra a defesa em profundidade que a irmã
--    place_bid_atomic já tem.
revoke execute on function public.place_lot_bid_atomic(uuid, numeric) from public, anon;

-- 6. Mesma classe: UPDATE/DELETE direto em auction_bids/auction_lot_bids
--    continuava concedido a anon/authenticated depois do hardening de
--    25/08 (que só revogou INSERT). RLS já bloqueia essas tabelas pra
--    não-admin, então não é explorável — só fecha o GRANT redundante.
revoke update, delete on public.auction_bids from anon, authenticated;
revoke update, delete on public.auction_lot_bids from anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────

-- 7. Duas policies de storage.objects "mortas" referenciando buckets que
--    nunca existiram (ads-images/avatars/banners/auction-images, vs. os 5
--    reais: ad-images/ad-videos/kyc-docs/profile-banners/site-assets) —
--    inofensivas (nunca concedem a única permissão que protegeria algo,
--    cada bucket real já tem sua própria policy correta), mas confundem
--    quem for auditar RLS de storage depois.
drop policy if exists "Leitura pública de mídia" on storage.objects;
drop policy if exists "Usuário faz upload das próprias imagens" on storage.objects;

-- 8. Upload em ad-images não checava dono da pasta — qualquer autenticado
--    podia gravar na pasta de OUTRO usuário (ex.: forjar um anúncio com
--    fotos hospedadas na pasta de outra pessoa). A policy irmã de DELETE
--    já faz essa checagem; a de INSERT nunca fez.
drop policy if exists "Auth users can upload ad images" on storage.objects;
create policy "Auth users can upload ad images"
on storage.objects for insert
with check (
  bucket_id = 'ad-images'
  and auth.role() = 'authenticated'
  and (auth.uid())::text = (storage.foldername(name))[1]
);

-- 9. Upload em ad-videos não checava plano (has_video) nem dono — qualquer
--    autenticado, mesmo no Grátis, conseguia gravar arquivo de vídeo no
--    bucket (só não conseguia depois vincular via ads.video_url, barrado
--    pelo trigger enforce_ad_media_plan_limits) — abuso de armazenamento.
--    Usa a coluna `owner` (não pasta), mesmo mecanismo que as próprias
--    policies de UPDATE/DELETE de vídeo já usam para este bucket.
drop policy if exists "Usuários autenticados podem enviar vídeos" on storage.objects;
create policy "Usuários autenticados podem enviar vídeos"
on storage.objects for insert
with check (
  bucket_id = 'ad-videos'
  and auth.role() = 'authenticated'
  and owner = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1
        from public.user_secrets us
        join public.plans p on p.id::text = us.plan_id
       where us.id = auth.uid()
         and p.has_video
    )
  )
);

-- ────────────────────────────────────────────────────────────────────────

-- 10. Badge de "Identidade" em /painel nunca mostrava "Em Análise" depois
--     de um envio real — VerificacaoClient.tsx insere em
--     verification_requests com status='pending', mas nada tocava
--     profiles.kyc_status (só app/api/admin/verify-user grava 'approved'/
--     'rejected'). Usuário via "Não Enviado" com o botão de reenvio ainda
--     visível mesmo com uma solicitação pendente de verdade no banco.
create or replace function public.set_profile_kyc_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    update public.profiles
       set kyc_status = 'pending'
     where id = new.user_id
       and kyc_status is distinct from 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists set_profile_kyc_pending on public.verification_requests;

create trigger set_profile_kyc_pending
  after insert on public.verification_requests
  for each row
  execute function public.set_profile_kyc_pending();

-- ────────────────────────────────────────────────────────────────────────

-- 11. Descoberto testando o item 4 (expire_ads): ads_search_vector_update
--     (trigger BEFORE UPDATE em `ads`, fora do histórico de migrations)
--     chama unaccent(...) sem qualificar o schema. Isso nunca deu erro em
--     updates normais via PostgREST (o search_path da conexão inclui
--     public, onde a extensão unaccent está instalada) — mas
--     expire_ads(), como toda função nova desta sessão, roda com
--     `set search_path = ''`, e um trigger disparado DENTRO dela herda
--     esse search_path vazio. Resultado: TODO UPDATE em `ads` feito por
--     expire_ads() falhava com "function unaccent(text) does not exist",
--     confirmado ao vivo. Qualificar o schema resolve pra qualquer
--     search_path do chamador, não só o deste caso.
create or replace function public.ads_search_vector_update()
returns trigger
language plpgsql
as $function$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', public.unaccent(coalesce(NEW.title_pt, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.unaccent(coalesce(NEW.description, ''))), 'B') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(NEW.city, '') || ' ' || coalesce(NEW.state, '') || ' ' || coalesce(NEW.country, ''))), 'C') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(NEW.category_id, ''))), 'A');
  RETURN NEW;
END;
$function$;
