-- ============================================================================
--  Correções do teste de estresse full-system + revalidação de regras de
--  negócio (2026-08-31) — ver docs/CHECKLIST-PRODUCAO.md, entrada "🔍 Teste
--  de estresse full-system", 24 achados confirmados por auditoria + adversarial
--  verify (workflow de 39 agentes) + teste ao vivo com contas descartáveis.
--
--  Aplicando os 24 nesta única migration, na ordem do relatório
--  (crítico → alto → médio → baixo). Cada bloco documenta o achado que fecha.
-- ============================================================================

-- ── 1. CRÍTICO: DELETE direto em `ads` apaga de verdade, bypassa soft-delete
-- e cascateia destruição de denúncias/leilão/mensagens. Policy nunca esteve
-- em nenhuma migration (drift). O app só faz soft-delete (status='deleted');
-- não há caso de uso legítimo para DELETE físico via API pública.
drop policy if exists "Dono pode deletar seu próprio anúncio" on public.ads;

-- ── 6. ALTO: policy de INSERT em user_secrets, não rastreada, sem guard
-- equivalente ao de UPDATE. App nunca insere em user_secrets diretamente —
-- a linha nasce via trigger on_profile_created_secret (SECURITY DEFINER),
-- que ignora RLS. Fecha o caminho de auto-concessão de is_admin caso uma
-- linha seja apagada por qualquer motivo no futuro.
drop policy if exists "Users can insert their own secrets" on public.user_secrets;

-- ── 3. ALTO: get_user_ads_stats (plural) — gêmea não corrigida do IDOR que
-- acabou de ser fechado em get_user_ad_stats (singular, 20260831120000).
-- Sem call site no app (getUserAdStats() em lib/supabase.ts/supabase-panel.ts
-- não é chamado em nenhum componente) — remove em vez de corrigir, evita
-- deixar mais uma função morta pra reabrir depois.
drop function if exists public.get_user_ads_stats(uuid);

-- ── 4. ALTO: toggle_favorite (sem _atomic) — gêmea não corrigida do IDOR já
-- fechado em toggle_favorite_atomic (20260823140000). App só usa a _atomic.
drop function if exists public.toggle_favorite(uuid, uuid);

-- ── 5. ALTO: place_bid (sem _atomic) — gêmea da place_bid_atomic pré-fix,
-- hoje morta só por acidente (bug de enum). Sem validação de dono/incremento/
-- vendedor-não-pode-dar-lance-no-próprio-leilão. App só usa a _atomic/lote.
drop function if exists public.place_bid(uuid, uuid, numeric);

-- ── 21. BAIXO: check_ad_limit/get_user_plan — código morto (sem call site),
-- mesmo padrão de UUID de cliente sem checar dono.
drop function if exists public.check_ad_limit(uuid);
drop function if exists public.get_user_plan(uuid);

-- ── 22. BAIXO: funções de manutenção sem o REVOKE que toda irmã de cron já
-- tem, + 2 sem nenhuma migration rastreada (expire_old_ads é duplicata morta
-- de expire_ads; refresh_admin_stats_cache referencia uma materialized view
-- que não existe — ambas as chamadas hoje só falham, nunca expõem dado).
revoke execute on function public.purge_old_api_request_logs() from public, anon, authenticated;
revoke execute on function public.purge_old_pending_password_recovery() from public, anon, authenticated;
drop function if exists public.expire_old_ads();
drop function if exists public.refresh_admin_stats_cache();

-- ── 7. ALTO (regressão): rate limit de denúncias desligado silenciosamente
-- — check_rate_limit perdeu EXECUTE de anon/authenticated (20260830200000,
-- pra fechar OUTRA brecha) e AdReportModal.tsx não trata o error do RPC.
-- Mesma solução já usada (sem saber) para mensagens: um trigger BEFORE
-- INSERT direto na tabela, que nenhum client-side bypass alcança. Also
-- versiona aqui o trigger de mensagens (existia em produção sem NENHUMA
-- migration — mesmo padrão de drift já visto em is_admin()/coupon
-- functions) para o histórico parar de divergir do banco real.
create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  message_count int;
begin
  select count(*)
    into message_count
    from messages
   where sender_id = new.sender_id
     and created_at >= now() - interval '1 hour';
  if message_count >= 20 then
    raise exception 'Rate limit exceeded: Você atingiu o limite de segurança de 20 mensagens por hora para evitar Spam. Aguarde para enviar novos contatos.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_message_rate_limit on public.messages;
create trigger enforce_message_rate_limit
  before insert on public.messages
  for each row execute function public.check_message_rate_limit();

create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  report_count int;
begin
  if new.reporter_id is not null then
    select count(*)
      into report_count
      from reports
     where reporter_id = new.reporter_id
       and created_at >= now() - interval '1 hour';
  else
    -- Denúncia anônima: sem reporter_id pra agrupar, limita por anúncio
    -- denunciado (mesmo critério de bucket que o RPC quebrado já usava:
    -- `report_ad_${adId}` quando não há sessão).
    select count(*)
      into report_count
      from reports
     where ad_id = new.ad_id
       and reporter_id is null
       and created_at >= now() - interval '1 hour';
  end if;

  if report_count >= 10 then
    raise exception 'Rate limit exceeded: limite de segurança de denúncias por hora atingido. Aguarde para denunciar novamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_report_rate_limit on public.reports;
create trigger enforce_report_rate_limit
  before insert on public.reports
  for each row execute function public.check_report_rate_limit();

-- ── 18. BAIXO: step=0/null em auction_events permite lance IGUAL ao atual
-- "vencer" sem incremento real. Piso mínimo de 0.01 (menor unidade
-- monetária) garante aumento real mesmo quando o evento nunca configurou
-- step — sem mudar comportamento de nenhum evento com step > 0 real.
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

-- ── 10. ALTO: migration 20260830180000 consta como aplicada, mas as
-- policies reais de institutional_pages continuam sendo as ANTIGAS ("Public
-- read access"/"Admin write access") — a migration não teve efeito em
-- produção por motivo não identificado (mesma classe de drift já vista
-- neste projeto). Reaplica de forma robusta (loop dinâmico por CMD, não por
-- nome) pra não depender de suposição sobre o nome atual.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'institutional_pages'
  loop
    execute format('drop policy %I on public.institutional_pages', pol.policyname);
  end loop;
end $$;

create policy "Leitura pública de páginas institucionais" on public.institutional_pages
  for select using (true);

create policy "Admin gerencia páginas institucionais" on public.institutional_pages
  for all
  using (is_admin())
  with check (is_admin());

-- ── 20. BAIXO: RLS de `plans` tem 3 policies de SELECT redundantes, 2 delas
-- sem checar is_active — planos desativados ficam publicamente legíveis via
-- PostgREST direto. Mantém só a que filtra is_active (rotas de cobrança já
-- filtram no servidor, então isso é só exposição de leitura, não risco de
-- cobrança).
drop policy if exists "Planos visíveis por todos" on public.plans;
drop policy if exists "Leitura pública de planos" on public.plans;

-- ── 17. BAIXO: auction_events/auction_lots com GRANT de tabela amplo pra
-- anon/authenticated, inconsistente com o REVOKE já feito nas irmãs
-- auction_bids/auction_lot_bids (20260826100100). Neutralizado hoje pela RLS
-- (is_admin()), mas sem defesa em profundidade — fecha a mesma lacuna aqui.
revoke insert, update, delete on public.auction_events from anon, authenticated;
revoke insert, update, delete on public.auction_lots from anon, authenticated;

-- ── 19. BAIXO: webhook_events com GRANT total pra anon/authenticated sem
-- nenhuma policy de RLS — hoje inofensivo (RLS habilitada + zero policies =
-- nega tudo), mas frágil a uma policy futura mal escrita nesta tabela de
-- idempotência de billing.
revoke all on public.webhook_events from anon, authenticated;

-- ── 16. MÉDIO: ALTER DEFAULT PRIVILEGES nunca foi corrigido — o REVOKE de
-- TRUNCATE/TRIGGER/EXECUTE já feito é reativo (tabela por tabela), não
-- preventivo. Qualquer tabela/função nova criada pelo role `postgres` (o que
-- roda as migrations) nasceria com GRANT amplo padrão de novo. Fecha pra
-- objetos futuros.
alter default privileges for role postgres in schema public
  revoke truncate, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- ── 23. BAIXO: 34 subcategorias (8 categorias inteiras) existem em produção
-- sem nenhuma migration correspondente — reconstruir o banco do zero
-- deixaria essas 8 categorias sem nenhuma subcategoria, tornando publicar
-- anúncio nelas impossível (agrava o achado 15, corrigido no app). Insert
-- idempotente com os dados reais capturados de produção.
insert into public.subcategories (id, category_id, name_pt, name_es, sort_order, active) values
  ('sub-aquicultura-tilapia', 'cat-aquicult', 'Tilápia', 'Tilapia', 1, true),
  ('sub-aquicultura-camarao', 'cat-aquicult', 'Camarão', 'Camarón', 2, true),
  ('sub-aquicultura-peixes-ornamentais', 'cat-aquicult', 'Peixes Ornamentais', 'Peces Ornamentales', 3, true),
  ('sub-aquicultura-equipamentos', 'cat-aquicult', 'Equipamentos de Aquicultura', 'Equipos de Acuicultura', 4, true),
  ('sub-aves-frango-de-corte', 'cat-aves', 'Frango de Corte', 'Pollo de Engorde', 1, true),
  ('sub-aves-poedeiras', 'cat-aves', 'Poedeiras', 'Ponedoras', 2, true),
  ('sub-aves-ornamentais', 'cat-aves', 'Aves Ornamentais', 'Aves Ornamentales', 3, true),
  ('sub-aves-perus', 'cat-aves', 'Perus', 'Pavos', 4, true),
  ('sub-aves-codornas', 'cat-aves', 'Codornas', 'Codornices', 5, true),
  ('sub-genetica-semen-bovino', 'cat-genetica', 'Sêmen Bovino', 'Semen Bovino', 1, true),
  ('sub-genetica-embrioes', 'cat-genetica', 'Embriões', 'Embriones', 2, true),
  ('sub-genetica-semen-equino', 'cat-genetica', 'Sêmen Equino', 'Semen Equino', 3, true),
  ('sub-genetica-material-genetico-suino', 'cat-genetica', 'Material Genético Suíno', 'Material Genético Porcino', 4, true),
  ('sub-insumos-fertilizantes', 'cat-insumos', 'Fertilizantes', 'Fertilizantes', 1, true),
  ('sub-insumos-sementes', 'cat-insumos', 'Sementes', 'Semillas', 2, true),
  ('sub-insumos-defensivos-agricolas', 'cat-insumos', 'Defensivos Agrícolas', 'Agroquímicos', 3, true),
  ('sub-insumos-racao-animal', 'cat-insumos', 'Ração Animal', 'Alimento Balanceado', 4, true),
  ('sub-insumos-suplementos-minerais', 'cat-insumos', 'Suplementos Minerais', 'Suplementos Minerales', 5, true),
  ('sub-maquinas-tratores', 'cat-maquinas', 'Tratores', 'Tractores', 1, true),
  ('sub-maquinas-colheitadeiras', 'cat-maquinas', 'Colheitadeiras', 'Cosechadoras', 2, true),
  ('sub-maquinas-implementos-agricolas', 'cat-maquinas', 'Implementos Agrícolas', 'Implementos Agrícolas', 3, true),
  ('sub-maquinas-pulverizadores', 'cat-maquinas', 'Pulverizadores', 'Pulverizadoras', 4, true),
  ('sub-maquinas-irrigacao', 'cat-maquinas', 'Equipamentos de Irrigação', 'Equipos de Riego', 5, true),
  ('sub-maquinas-caminhoes-e-utilitarios', 'cat-maquinas', 'Caminhões e Utilitários', 'Camiones y Utilitarios', 6, true),
  ('sub-outros-diversos', 'cat-outros', 'Diversos / Não Classificado', 'Varios / No Clasificado', 1, true),
  ('sub-servicos-transporte-de-animais', 'cat-servicos', 'Transporte de Animais', 'Transporte de Animales', 1, true),
  ('sub-servicos-assistencia-veterinaria', 'cat-servicos', 'Assistência Veterinária', 'Asistencia Veterinaria', 2, true),
  ('sub-servicos-consultoria-agronomica', 'cat-servicos', 'Consultoria Agronômica', 'Consultoría Agronómica', 3, true),
  ('sub-servicos-leiloes-e-remates', 'cat-servicos', 'Leilões e Remates', 'Subastas y Remates', 4, true),
  ('sub-servicos-manutencao-de-maquinas', 'cat-servicos', 'Manutenção de Máquinas', 'Mantenimiento de Maquinaria', 5, true),
  ('sub-medicamentos-vacinas', 'medicamentos', 'Vacinas', 'Vacunas', 1, true),
  ('sub-medicamentos-antibioticos', 'medicamentos', 'Antibióticos', 'Antibióticos', 2, true),
  ('sub-medicamentos-antiparasitarios', 'medicamentos', 'Antiparasitários', 'Antiparasitarios', 3, true),
  ('sub-medicamentos-vitaminas-e-suplementos', 'medicamentos', 'Vitaminas e Suplementos', 'Vitaminas y Suplementos', 4, true)
on conflict (id) do nothing;
