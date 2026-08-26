-- ============================================================================
--  guard_ad_featured passa a checar TAMBÉM plans.highlight_count, não só
--  quem pode escrever
-- ============================================================================
--
--  A migration 20260825150000 fechou o "quem" (só admin/service_role
--  escrevem featured). Esta fecha o "quanto": plans.highlight_count é
--  vendido em /planos ("2 destaques mensais" PRO, "10" Premium) mas nada
--  limitava quantos anúncios um admin podia destacar pra um mesmo usuário.
--
--  INTERPRETAÇÃO ADOTADA: teto de anúncios SIMULTANEAMENTE destacados
--  (mesmo padrão de enforce_ad_quota pra max_ads — "até N ativos ao mesmo
--  tempo"), não um crédito mensal renovável de N usos. Não há em nenhum
--  lugar do código/produto hoje um conceito de "cota mensal que reseta" —
--  construir isso exigiria uma tabela nova de contagem por período, sem
--  nenhum precedente no projeto. Se a intenção de produto for outra
--  ("2 trocas de destaque por mês", por exemplo), isto precisa ser
--  revisado — registrado aqui de propósito para não silenciar a
--  ambiguidade.
-- ============================================================================

create or replace function public.guard_ad_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_highlight_count integer;
  v_current_count integer;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    -- Só checa o teto ao LIGAR um destaque novo — desligar (ou manter como
    -- estava) nunca deveria ser bloqueado pelo próprio limite.
    if new.featured = true and old.featured is distinct from true then
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
           and id <> new.id;

        if v_current_count >= v_highlight_count then
          raise exception
            'ads: limite de % destaques simultaneos do plano deste vendedor atingido', v_highlight_count
            using errcode = 'P0001';
        end if;
      end if;
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
