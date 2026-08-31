-- ============================================================================
--  Fecha o bypass de rate limiting via chamada direta ao PostgREST
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança independente, 2026-08-30 — dois achados
--  "alto" relacionados, mesma causa raiz)
--
--  1. public.check_rate_limit(p_bucket, p_limit, p_window_seconds) precisa de
--     EXECUTE liberado para `anon` (tem que funcionar antes do login), mas o
--     bucket/limite são texto livre escolhido por quem chama. A anon key é
--     pública por design — não há como o GRANT do Postgres distinguir "app
--     server chamando com a anon key" de "atacante chamando com a mesma anon
--     key pública direto via /rest/v1/rpc/check_rate_limit". Um atacante podia
--     chamar com o MESMO bucket de uma vítima real (ex.: `login_<ip-da-
--     vítima>`, construído de forma previsível em lib/rate-limit-fallback.ts)
--     e um p_limit alto, pré-enchendo a janela dela — negação de serviço
--     direcionada contra login/contato/checkout de terceiros, sem precisar
--     de nenhuma autenticação.
--
--  2. public.get_seller_phone(p_ad_id) tem EXECUTE liberado para
--     `authenticated` (precisa: qualquer comprador real chama pra ver o
--     WhatsApp do vendedor) e só checa auth.uid() não-nulo + anúncio ativo —
--     sem limite próprio. O único consumidor no app (app/api/contact-seller)
--     aplica rate limit, mas isso não protege quem chama a RPC DIRETO via
--     PostgREST, contornando a rota Next.js inteira. Como criar conta é
--     grátis e imediato, qualquer um podia colher o telefone de todo vendedor
--     ativo em lote.
--
--  SOLUÇÃO
--
--  Para (1): parar de depender do GRANT a anon/authenticated. Todo chamador
--  desta função no código do app já roda em contexto de servidor confiável
--  (middleware, route handlers) — lib/rate-limit-fallback.ts passou a usar
--  seu próprio client de service_role internamente, então o EXECUTE de
--  anon/authenticated pode ser revogado sem quebrar nenhum fluxo real, no
--  mesmo padrão já usado para as RPCs de cupom (20260825150400).
--
--  Para (2): não dá pra mover pra service_role-only — a função depende de
--  auth.uid() ser o JWT real de quem chama, exatamente pra saber QUEM está
--  pedindo. A defesa correta é a mesma já usada em toda RPC sensível deste
--  projeto (place_bid_atomic, check_rate_limit): chamar check_rate_limit()
--  de dentro da própria função, com o bucket amarrado a auth.uid() — que o
--  chamador não pode forjar (é o uid do seu PRÓPRIO JWT válido), ao contrário
--  de um bucket passado como parâmetro texto livre. Como get_seller_phone já
--  é SECURITY DEFINER, ela chama check_rate_limit() com os privilégios do
--  definer, independente do REVOKE de authenticated feito no item (1).
-- ============================================================================

-- BUG CORRIGIDO (validação ao vivo desta própria migration): a migration
-- original (20260822120500) nunca revogou o GRANT padrão do Postgres a
-- PUBLIC concedido automaticamente na criação da função (só ADICIONOU grants
-- explícitos a anon/authenticated/service_role, sem nunca revogar o
-- implícito) — revogar só de anon/authenticated não bastava, porque toda
-- role herda o que é concedido a PUBLIC. Confirmado ao vivo: sem esta linha,
-- anon/authenticated continuavam com EXECUTE via PUBLIC mesmo depois do
-- revoke abaixo.
revoke execute on function public.check_rate_limit(text, integer, integer)
  from public;
revoke execute on function public.check_rate_limit(text, integer, integer)
  from anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.get_seller_phone(p_ad_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id   uuid := auth.uid();
  v_seller_id uuid;
  v_phone     text;
begin
  if v_user_id is null then
    return null;
  end if;

  -- Backstop de rate limit amarrado ao auth.uid() real do chamador (não a um
  -- valor que ele possa escolher) — vale tanto para quem passa pela rota
  -- /api/contact-seller (que já tem seu próprio limite, mais apertado) quanto
  -- para quem chama esta RPC direto via PostgREST, contornando a rota.
  if not public.check_rate_limit('get_seller_phone_' || v_user_id::text, 20, 60) then
    return null;
  end if;

  select ad.user_id into v_seller_id
    from ads ad
   where ad.id = p_ad_id
     and ad.status = 'active';

  if v_seller_id is null then
    return null;
  end if;

  select us.phone_whatsapp into v_phone
    from user_secrets us
   where us.id = v_seller_id;

  return v_phone;
end;
$function$;

revoke all on function public.get_seller_phone(uuid) from public;
revoke execute on function public.get_seller_phone(uuid) from anon;
grant execute on function public.get_seller_phone(uuid) to authenticated;
