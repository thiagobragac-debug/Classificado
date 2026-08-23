-- ============================================================================
--  Aplicar o limite de anúncios ativos do plano (plans.max_ads)
-- ============================================================================
--
--  PROBLEMA
--
--  plans.max_ads existe, é editável no admin e é vendido na página de planos
--  ("3 anúncios ativos" no Grátis, 15 no PRO, ilimitado no Premium) — mas não
--  era conferido em lugar nenhum. createAd() em lib/supabase.ts insere direto
--  em `ads` com a anon key; POST /api/v1/ads insere com service_role. Nenhum
--  dos dois olhava a cota.
--
--  POR QUE NO BANCO
--
--  Checar no cliente seria contornável com uma chamada direta ao PostgREST
--  usando a anon key, que é pública. Checar só nas rotas de API deixaria de
--  fora o caminho do browser. O banco é o único ponto por onde toda escrita
--  passa obrigatoriamente.
--
--  REGRA
--
--  Só anúncio `active` ocupa vaga. Rascunho, pausado, pendente e rejeitado não
--  contam. A cobrança acontece na entrada em `active` — seja por INSERT ou por
--  UPDATE de status —, nunca em quem já estava ativo.
--
--  ESTADO ATUAL: 1 usuário já tem 9 anúncios ativos, acima do limite do Grátis.
--  O trigger não mexe em quem já está lá; apenas impede novas ativações até
--  voltar ao limite. Isso é deliberado — remover anúncio publicado de alguém
--  sem aviso seria pior que o problema.
-- ============================================================================

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
  -- Só anúncio ativo ocupa vaga.
  if new.status::text is distinct from 'active' then
    return new;
  end if;

  -- Em UPDATE, quem já estava ativo não é cobrado de novo.
  if tg_op = 'UPDATE' then
    if old.status::text = 'active' then
      return new;
    end if;
  end if;

  select p.max_ads
    into v_max
    from public.user_secrets us
    left join public.plans p on p.id = us.plan_id
   where us.id = new.user_id;

  -- Sem plano associado — hoje o caso de todos os usuários — vale o gratuito.
  if v_max is null then
    select max_ads
      into v_max
      from public.plans
     where is_active and price = 0
     order by sort_order
     limit 1;
  end if;

  -- Nenhum plano gratuito configurado: não é papel deste trigger inventar um
  -- limite, então deixa passar em vez de travar a plataforma inteira.
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

drop trigger if exists enforce_ad_quota on public.ads;

create trigger enforce_ad_quota
  before insert or update of status on public.ads
  for each row
  execute function public.enforce_ad_quota();
