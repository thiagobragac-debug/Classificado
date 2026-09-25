-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25,
-- verificado adversarialmente 3x sem refutação): is_valid_bid_amount()
-- bloqueia NaN (migration 20260829121500/20260829131500) mas nunca checou
-- o outro valor especial que `numeric` aceita como literal desde o
-- Postgres 14: 'Infinity'/'-Infinity'. O MESMO ataque já documentado e
-- corrigido pra NaN funciona de novo trocando o literal — um POST direto
-- em /rest/v1/rpc/place_lot_bid_atomic (ou place_bid_atomic, sistema
-- legado) com p_amount:"Infinity" passa por `p_amount <> 'NaN'::numeric
-- and p_amount > 0` (Infinity <> NaN e Infinity > 0 são ambos verdadeiros)
-- e por `p_amount < v_min_valid` (Infinity nunca é menor que nada finito),
-- grava current_bid = Infinity no lote/leilão. Dali em diante
-- v_min_valid = Infinity + step = Infinity pra sempre — nenhum lance
-- futuro finito passa, o lote fica travado com um "vencedor" fictício
-- permanentemente, mesmo efeito prático do incidente de NaN.
create or replace function public.is_valid_bid_amount(p_amount numeric)
 returns boolean
 language sql
 immutable
as $function$
  select p_amount is not null
     and p_amount <> 'NaN'::numeric
     and p_amount <> 'Infinity'::numeric
     and p_amount <> '-Infinity'::numeric
     and p_amount > 0;
$function$;
