-- ============================================================================
--  Fecha o bypass mais crítico da validação de 2026-08-26: INSERT direto
--  pulava moderação E destaque por completo
-- ============================================================================
--
--  PROBLEMA
--
--  guard_ad_moderation e guard_ad_featured (20260825150000) só foram
--  criados como `before update` — nunca `before insert`. A policy de
--  INSERT ("Users can insert their own ads.") só verifica
--  auth.uid()=user_id, sem checar status/featured. Confirmado ao vivo,
--  duas vezes de forma independente: um usuário comum, plano Grátis,
--  consegue POST /rest/v1/ads com status:'active', featured:true e
--  recebe 201 — anúncio nasce já ativo e destacado, sem revisão nenhuma
--  e sem respeitar o teto de highlight_count.
--
--  Também fechado aqui: editar só `video_url` de um anúncio ativo não
--  exigia nova moderação (editar `images` já exigia — assimetria real,
--  mesma classe de risco de bait-and-switch de conteúdo pós-aprovação).
--  E: guard_ad_featured agora também exige status='active' pra destacar
--  (achado de severidade baixa da mesma rodada).
-- ============================================================================

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

  -- INSERT: usuário comum nunca nasce com o anúncio já 'active' — sem
  -- isso, dava pra pular a fila inteira só inserindo direto com
  -- status:'active' em vez de fazer INSERT+UPDATE depois.
  if tg_op = 'INSERT' then
    if new.status = 'active'::public.ad_status then
      raise exception
        'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: pular a fila continua bloqueado.
  if new.status = 'active'::public.ad_status and old.status is distinct from 'active'::public.ad_status then
    raise exception
      'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
      using errcode = '42501';
  end if;

  -- UPDATE: editar conteúdo mantendo 'active' continua exigindo nova
  -- moderação. video_url removido da lista de exclusão — antes só fotos
  -- exigiam isso, vídeo não.
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

drop trigger if exists guard_ad_moderation on public.ads;

create trigger guard_ad_moderation
  before insert or update on public.ads
  for each row
  execute function public.guard_ad_moderation();

-- ────────────────────────────────────────────────────────────────────────

create or replace function public.guard_ad_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_highlight_count integer;
  v_current_count integer;
  v_wants_featured boolean;
begin
  v_wants_featured := coalesce(new.featured, false);

  if auth.role() = 'service_role' or public.is_admin() then
    -- Checa o teto só quando o destaque está LIGANDO agora — em INSERT
    -- (sem OLD) isso é só new.featured=true; em UPDATE, só quando
    -- realmente estava desligado antes.
    if v_wants_featured and (tg_op = 'INSERT' or old.featured is distinct from true) then

      if new.status is distinct from 'active'::public.ad_status then
        raise exception
          'ads: so e possivel destacar um anuncio ativo'
          using errcode = 'P0001';
      end if;

      select p.highlight_count
        into v_highlight_count
        from public.user_secrets us
        left join public.plans p on p.id::text = us.plan_id
       where us.id = new.user_id;

      if v_highlight_count is null then
        select highlight_count
          into v_highlight_count
          from public.plans
         where is_active and price = 0
         order by sort_order
         limit 1;
      end if;

      if v_highlight_count is not null then
        select count(*)
          into v_current_count
          from public.ads
         where user_id = new.user_id
           and featured = true
           and (tg_op = 'INSERT' or id <> new.id);

        if v_current_count >= v_highlight_count then
          raise exception
            'ads: limite de % destaques simultaneos do plano deste vendedor atingido', v_highlight_count
            using errcode = 'P0001';
        end if;
      end if;
    end if;

    return new;
  end if;

  -- Não-admin: nunca pode ligar featured, nem no INSERT nem no UPDATE.
  if tg_op = 'INSERT' then
    if v_wants_featured then
      raise exception
        'ads.featured so pode ser alterado pela moderacao'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.featured is distinct from old.featured then
    raise exception
      'ads.featured so pode ser alterado pela moderacao'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_ad_featured on public.ads;

create trigger guard_ad_featured
  before insert or update on public.ads
  for each row
  execute function public.guard_ad_featured();
