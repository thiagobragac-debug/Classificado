-- ============================================================================
--  Restaura o rate limit client-side de mensagens/denúncias, sem reabrir o
--  bypass que 20260830200000 fechou
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  components/ads/AdMessageForm.tsx e AdReportModal.tsx chamam
--  `check_rate_limit(p_bucket, p_limit, p_window_seconds)` diretamente via
--  RPC do cliente — mas 20260830200000_fecha_bypass_rate_limit_via_rpc_direta
--  revogou EXECUTE dessa função de anon/authenticated (deixou só
--  service_role), exatamente pra impedir que um chamador passe um
--  p_bucket arbitrário e mire o balde de outra pessoa. Consequência não
--  intencional: as duas chamadas client-side passaram a retornar erro de
--  permissão em toda chamada; como nenhum dos dois componentes trata
--  `error` (só desestruturam `data`), o guard `dentroDoLimite === false`
--  nunca dispara — o pré-check virou código morto, silenciosamente.
--
--  Não é bypass total: um trigger BEFORE INSERT em cada tabela já cobre o
--  caso (enforce_message_rate_limit: 20 msgs/hora; enforce_report_rate_limit:
--  10 denúncias/hora, ambos de 20260831130000) — mas bem mais permissivo
--  que os limites prometidos na UI (10 msgs/60s, 5 denúncias/60s).
--
--  SOLUÇÃO
--
--  Mesmo padrão já usado neste repositório pra get_seller_phone (mesma
--  migration que fechou o bypass): uma função SECURITY DEFINER por caso de
--  uso, que constrói o bucket internamente a partir de auth.uid() (o
--  chamador não pode forjar, é o uid do próprio JWT válido) em vez de
--  aceitar um bucket livre como parâmetro — o convite ao GRANT público fica
--  seguro porque não existe mais texto livre pra explorar.
-- ============================================================================

create or replace function public.check_message_rate_limit()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;
  return public.check_rate_limit('message_user_' || v_user_id::text, 10, 60);
end;
$function$;

revoke all on function public.check_message_rate_limit() from public;
revoke execute on function public.check_message_rate_limit() from anon;
grant execute on function public.check_message_rate_limit() to authenticated;

-- Denúncia anônima continua permitida por design (ver AdReportModal.tsx) —
-- sem sessão não há auth.uid() pra amarrar o bucket, então usa p_ad_id
-- (já validado como uuid pelo tipo do parâmetro, sem risco de injeção/
-- texto livre) pra limitar por ANÚNCIO em vez de por usuário. Pior caso de
-- abuso é bem mais restrito que o bypass original: no máximo alguém
-- pré-enche o balde de denúncias de UM anúncio específico por 60s, não o
-- de login/checkout/contato de uma vítima escolhida livremente.
create or replace function public.check_report_rate_limit(p_ad_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_bucket  text;
begin
  v_bucket := case when v_user_id is not null
    then 'report_user_' || v_user_id::text
    else 'report_ad_' || p_ad_id::text
  end;
  return public.check_rate_limit(v_bucket, 5, 60);
end;
$function$;

revoke all on function public.check_report_rate_limit(uuid) from public;
grant execute on function public.check_report_rate_limit(uuid) to anon, authenticated;
