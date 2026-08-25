-- ============================================================================
--  Aplica no banco os benefícios de mídia do plano: max_photos, has_video,
--  has_banner
-- ============================================================================
--
--  PROBLEMA
--
--  plans.max_photos/has_video/has_banner são vendidos em /planos e editáveis
--  no admin, mas nada no banco os aplicava:
--    - max_photos: o wizard trava em 6 fotos pra TODO MUNDO (hardcoded em
--      schema.ts/StepPhotos.tsx) — Grátis (prometido 5) ganha 1 a mais, PRO
--      (15) e Premium (30) recebem menos da metade do prometido. E mesmo
--      corrigindo o cliente, uploadAdImage() vai direto pro Storage sem
--      checar plano — contornável via chamada direta.
--    - has_video/has_banner: colunas video_url/banner_url sempre estiveram
--      livres pra qualquer dono escrever, não importa o plano.
--
--  Mesma razão de sempre pra fazer isso no banco (já documentada em
--  enforce_ad_quota): checagem só no cliente é contornável com uma chamada
--  direta ao PostgREST usando a anon key, que é pública.
--
--  Estes triggers são só o "quanto"/"pode ou não" — não o "quem pode
--  escrever", que guard_ad_featured (20260825150000) já cobre pra featured.
--  video_url/banner_url continuam graváveis pelo dono (são features vendidas
--  de verdade, com upload real vindo no mesmo commit desta migration), só
--  que agora checadas contra o plano.
-- ============================================================================

create or replace function public.enforce_ad_media_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_photos integer;
  v_has_video  boolean;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  select p.max_photos, p.has_video
    into v_max_photos, v_has_video
    from public.user_secrets us
    left join public.plans p on p.id::text = us.plan_id
   where us.id = new.user_id;

  -- Sem plano associado (caso comum hoje) — vale o plano gratuito, mesmo
  -- fallback usado por enforce_ad_quota.
  if v_max_photos is null then
    select max_photos, has_video
      into v_max_photos, v_has_video
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;
  end if;

  -- Nenhum plano gratuito configurado: não trava a plataforma inteira por
  -- falta de dado de configuração.
  if v_max_photos is null then
    return new;
  end if;

  if new.images is not null and array_length(new.images, 1) > v_max_photos then
    raise exception
      'ads: seu plano permite ate % fotos por anuncio. Faca upgrade para enviar mais.', v_max_photos
      using errcode = 'P0001';
  end if;

  if new.video_url is not null and new.video_url is distinct from old.video_url and not coalesce(v_has_video, false) then
    raise exception
      'ads: video no anuncio nao esta incluido no seu plano. Faca upgrade para usar este recurso.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_ad_media_plan_limits on public.ads;

create trigger enforce_ad_media_plan_limits
  before insert or update of images, video_url on public.ads
  for each row
  execute function public.enforce_ad_media_plan_limits();

-- ────────────────────────────────────────────────────────────────────────
--  Mesma regra para profiles.banner_url (Premium: "Banner de perfil")
-- ────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_profile_banner_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_banner boolean;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.banner_url is null or new.banner_url is not distinct from old.banner_url then
    return new;
  end if;

  select p.has_banner
    into v_has_banner
    from public.user_secrets us
    left join public.plans p on p.id::text = us.plan_id
   where us.id = new.id;

  if v_has_banner is null then
    select has_banner
      into v_has_banner
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;
  end if;

  if not coalesce(v_has_banner, false) then
    raise exception
      'profiles: banner de perfil nao esta incluido no seu plano. Faca upgrade para usar este recurso.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_banner_plan_limit on public.profiles;

create trigger enforce_profile_banner_plan_limit
  before update of banner_url on public.profiles
  for each row
  execute function public.enforce_profile_banner_plan_limit();
