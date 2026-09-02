-- ============================================================================
--  Correções do teste de estresse full-system final (rodada 2026-09-01/02)
--  Cada bloco fecha um achado específico do relatório da rodada — ver
--  docs/CHECKLIST-PRODUCAO.md pra contexto completo de cada um.
-- ============================================================================

-- ── 1. ALTO — rate limit de denúncias nunca disparava ──────────────────────
--
-- check_report_rate_limit() conta `reports` do próprio remetente na última
-- hora, mas roda como SECURITY INVOKER (o padrão do LANGUAGE plpgsql sem
-- security definer). `reports` não tem NENHUMA policy de SELECT pra usuário
-- comum (só a policy "Admins gerenciam denuncias", que exige is_admin()) —
-- então o SELECT count(*) dentro do trigger sempre via 0 linhas pra
-- qualquer usuário não-admin, e o limite nunca disparava. Reproduzido ao
-- vivo: 13 denúncias seguidas do mesmo usuário, todas aceitas.
--
-- Diferente de check_message_rate_limit() (que funciona: `messages` TEM
-- policy "ver as próprias mensagens", então o SELECT ali enxerga as próprias
-- linhas mesmo sem SECURITY DEFINER). `reports` não tem esse equivalente —
-- a correção certa é SECURITY DEFINER, mesmo padrão já usado por is_admin(),
-- enforce_plan_expiration() e toda função de guarda deste projeto que
-- precisa enxergar além do que a RLS do chamador permite.
create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;

-- ── 2. ALTO — leilões em rascunho (draft) visíveis a qualquer anônimo ───────
--
-- A policy real em produção ("Qualquer um pode ler eventos", qual=true) não
-- é a que qualquer migration deste repositório criou — drift não rastreado,
-- mesmo padrão já visto antes em is_admin()/institutional_pages. Confirmado
-- via pg_policies: qual = "true", sem filtro de status.
drop policy if exists "Qualquer um pode ler eventos" on public.auction_events;
drop policy if exists "Anyone can view published auction events" on public.auction_events;

create policy "Anyone can view published auction events"
on public.auction_events for select
using (status != 'draft');

-- auction_lots tem a mesma policy sem filtro ("Qualquer um pode ler lotes",
-- qual=true, confirmado via pg_policies) — nunca rastreada em nenhuma
-- migration deste repositório. Fecha a mesma classe de drift: lote de
-- evento draft também não deveria ser público.
drop policy if exists "Qualquer um pode ler lotes" on public.auction_lots;
drop policy if exists "Anyone can view lots of published events" on public.auction_lots;
create policy "Anyone can view lots of published events"
on public.auction_lots for select
using (
  exists (
    select 1 from public.auction_events e
     where e.id = auction_lots.auction_id
       and e.status != 'draft'
  )
);

-- ── 3. MÉDIO — perfil público do vendedor sem gate de bloqueio ─────────────
--
-- `ads` já esconde corretamente o anúncio de vendedor bloqueado (confirmado
-- via pg_policies: a policy "Active ads are viewable by everyone" já inclui
-- o NOT EXISTS de is_blocked). `profiles` nunca ganhou o mesmo gate — a
-- policy real ("Public profiles are viewable by everyone", qual=true) exibe
-- nome/avatar/bio de vendedor banido pra qualquer um, indexável.
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;

create policy "Public profiles are viewable by everyone"
on public.profiles for select
using (
  not exists (
    select 1 from public.user_secrets us
     where us.id = profiles.id
       and us.is_blocked = true
  )
  or id = auth.uid()
);

-- ── 4. MÉDIO — messages: receiver_id não validado contra o dono do anúncio ──
--
-- Qualquer autenticado podia citar qualquer ad_id/receiver_id, iniciando
-- conversa com qualquer outro usuário sem relação nenhuma com o anúncio.
-- Consolidando as 4 policies de INSERT idênticas (acumuladas por migrations
-- anteriores que nunca limparam a antiga) numa só, com a validação nova:
-- receiver_id só pode ser o dono do anúncio (contato inicial) OU alguém que
-- já mandou mensagem pro remetente atual sobre o mesmo anúncio (resposta
-- legítima numa conversa já iniciada).
drop policy if exists "Users can send messages" on public.messages;
drop policy if exists "Usuários enviam mensagens como eles mesmos" on public.messages;
drop policy if exists "Usuários enviam mensagens como si mesmos" on public.messages;
drop policy if exists "Usuários podem enviar mensagens" on public.messages;

create policy "Usuários enviam mensagens como si mesmos, pro dono do anúncio ou em resposta"
on public.messages for insert
with check (
  auth.uid() = sender_id
  and (
    exists (select 1 from public.ads a where a.id = messages.ad_id and a.user_id = messages.receiver_id)
    or exists (
      select 1 from public.messages m
       where m.ad_id = messages.ad_id
         and m.sender_id = messages.receiver_id
         and m.receiver_id = auth.uid()
    )
  )
);

-- ── 5. BAIXO — messages.content sem CHECK de tamanho no banco ──────────────
-- Limite de 1000 caracteres era só client-side; um INSERT de 500KB era aceito.
alter table public.messages
  drop constraint if exists messages_content_length_check;
alter table public.messages
  add constraint messages_content_length_check check (char_length(content) <= 2000);

-- ── 6. BAIXO — messages: GRANT de UPDATE sem nenhuma policy de UPDATE ──────
-- Inofensivo hoje (RLS nega tudo sem policy), mas defesa em profundidade —
-- mesmo padrão já aplicado a auction_events/auction_lots antes.
revoke update on public.messages from anon, authenticated;

-- ── 7. BAIXO — enforce_plan_expiration chamável por anon com p_user_id
--      arbitrário (SECURITY DEFINER sem REVOKE de EXECUTE) ─────────────────
revoke all on function public.enforce_plan_expiration(uuid) from public, anon, authenticated;
grant execute on function public.enforce_plan_expiration(uuid) to service_role;
