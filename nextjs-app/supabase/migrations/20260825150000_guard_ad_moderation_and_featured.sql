-- ============================================================================
--  Fecha 2 brechas de regra de negócio em `ads`, achadas na revisão detalhada
--  de regras de negócio de 2026-08-25
-- ============================================================================
--
--  PROBLEMA 1 — moderação de anúncio contornável
--
--  A policy 4 de UPDATE ("Dono pode alterar seu próprio anúncio") só verifica
--  `user_id = auth.uid()`, sem nenhuma restrição sobre a coluna `status`. O
--  trigger que preveniria isso (`prevent_direct_activation`, escrito em
--  20260723071300_rls_hardening.sql) foi criado comentado e nunca ativado.
--
--  Resultado: qualquer vendedor autenticado, chamando o PostgREST direto com
--  seu próprio token (fora da UI, que sempre manda 'pending'), podia:
--    - pular a fila de moderação, ativando o próprio anúncio direto;
--    - reativar um anúncio que o admin tinha marcado 'rejected';
--    - editar o conteúdo de um anúncio já 'active' sem cair em nova revisão
--      (o clássico "aprovam limpo, editam pra proibido depois").
--
--  PROBLEMA 2 — ads.featured sem limite algum
--
--  plans.highlight_count vende "N destaques mensais" por plano, mas nenhuma
--  policy/trigger jamais restringiu quem escreve em ads.featured — a mesma
--  policy 4 permite. Confirmado com dado real de produção: 3 contas do plano
--  Grátis (highlight_count=0) já têm featured=true hoje, uma delas com 7
--  anúncios destacados simultâneos.
--
--  CORREÇÃO
--
--  Duas guardas, no mesmo espírito de guard_profile_verification
--  (20260822120400): bloqueiam a escrita fora do service_role, MAS também
--  liberam is_admin() — diferente de verified/kyc_status, aqui o padrão já
--  estabelecido no restante do admin (Aprovar/Rejeitar/Pausar anúncio, todos
--  via update direto com a própria sessão do admin, protegidos pela policy
--  "Admins gerenciam anuncios" is_admin()) é a sessão do admin poder agir
--  direto — não faria sentido exigir uma rota de API só pra isto quando todo
--  o resto da tela já não exige.
--
--  A cota de highlight_count por plano fica para uma migration separada
--  (20260825150200), junto com max_photos/has_video — este arquivo só fecha
--  o "quem pode escrever", não "quanto pode".
-- ============================================================================

create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- IMPORTANTE: current_user dentro de uma função SECURITY DEFINER sempre
  -- resolve pro DONO da função (aqui, 'postgres'), nunca pro papel que
  -- chamou — checar `current_user in (...)` aqui seria sempre verdadeiro
  -- pra qualquer chamador, um no-op disfarçado de guarda (bug real, achado
  -- e corrigido ao vivo ainda nesta sessão, com teste negativo). auth.role()
  -- lê o claim `role` do JWT da requisição, que é o jeito certo.
  --
  -- Segunda pegadinha achada testando ao vivo: com search_path='', o tipo
  -- `ad_status` (schema public) também não resolve sem qualificar — por
  -- isso todo cast abaixo usa `public.ad_status`, não `ad_status` puro.
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  -- Pular a fila: só moderação (admin/servidor) pode levar um anúncio a
  -- 'active' vindo de qualquer outro status (inclui reativar um 'rejected').
  if new.status = 'active'::public.ad_status and old.status is distinct from 'active'::public.ad_status then
    raise exception
      'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
      using errcode = '42501';
  end if;

  -- Editar conteúdo mantendo 'active': o wizard real (AnunciarWizard.tsx)
  -- sempre manda o anúncio de volta pra 'pending' ao editar, mesmo já ativo
  -- — isto é só a rede de segurança pro caso de alguém pular o wizard e
  -- chamar o PostgREST direto. Compara tudo MENOS as colunas operacionais
  -- (que mudam sem o dono ter editado conteúdo) em vez de listar campo por
  -- campo — mais seguro contra esquecer uma coluna nova no futuro.
  if old.status = 'active'::public.ad_status and new.status = 'active'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','views_count','search_vector','fts','featured','video_url','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','views_count','search_vector','fts','featured','video_url','expires_at'])
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
  before update on public.ads
  for each row
  execute function public.guard_ad_moderation();

-- ────────────────────────────────────────────────────────────────────────

create or replace function public.guard_ad_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
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
  before update on public.ads
  for each row
  execute function public.guard_ad_featured();
