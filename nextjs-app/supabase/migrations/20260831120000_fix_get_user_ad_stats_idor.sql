-- BUG CORRIGIDO (auditoria de segurança, 2026-08-31): get_user_ad_stats é
-- SECURITY DEFINER e aceitava p_user_id vindo do cliente sem nunca checar
-- auth.uid() — a mesma classe de bug já corrigida em place_bid_atomic,
-- place_lot_bid_atomic e toggle_favorite_atomic (20260823140000,
-- 20260824160000), mas esta função escapou daquela varredura. Qualquer
-- usuário autenticado podia chamar a RPC com o UUID de outra pessoa e ver
-- quantos anúncios ela tem (incluindo draft/pending/rejected/pausados, que
-- não é informação pública — a página pública do vendedor só mostra os
-- active). Assinatura mantida idêntica (p_user_id continua existindo no
-- parâmetro) para não quebrar os chamadores atuais
-- (app/(public)/painel/page.tsx, PainelClient.tsx) — o valor recebido
-- simplesmente deixa de ser usado, a função sempre responde pelo dono real
-- da sessão.
create or replace function public.get_user_ad_stats(p_user_id uuid)
returns table (
  total_ads bigint,
  active_ads bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select
    count(*) as total_ads,
    count(*) filter (where status = 'active') as active_ads
  from ads
  where user_id = auth.uid();
$$;

-- `revoke all ... from public` só revoga o grant feito ao pseudo-papel
-- PUBLIC — não alcança um grant feito diretamente a `anon` (era o caso aqui:
-- anon tinha EXECUTE próprio, separado do de PUBLIC). Revogado explicitamente
-- pelos dois. Risco residual do grant a anon já era baixo (auth.uid() nulo
-- pra chamador anônimo não bate com nenhum user_id, então o retorno já vinha
-- vazio), mas a intenção real (só authenticated) fica completa e explícita.
revoke all on function public.get_user_ad_stats(uuid) from public, anon;
grant execute on function public.get_user_ad_stats(uuid) to authenticated;
