-- ============================================================================
--  BUG CORRIGIDO (achado ao vivo, teste de estresse completo, 2026-09-01):
--  check_rate_limit() fazia um SELECT count(*) seguido de um INSERT como
--  duas instruções separadas, sem FOR UPDATE, sem lock advisory, sem
--  transação SERIALIZABLE — sob concorrência VERDADEIRA (múltiplas conexões
--  chamando a função pro MESMO bucket ao mesmo tempo), várias chamadas
--  podiam ler a contagem ANTES de qualquer INSERT concorrente commitar,
--  deixando passar uma rajada acima do limite nominal.
--
--  Não se manifestou nos testes de estresse desta sessão (rajadas de até 20
--  requisições verdadeiramente simultâneas contra o dev server local, single
--  -process, sempre respeitaram o limite exato) — mas a falha estrutural no
--  SQL é real e a ausência de reprodução empírica numa topologia de teste
--  não prova segurança numa topologia de produção com mais paralelismo
--  real (múltiplas instâncias de função serverless atendendo o mesmo
--  usuário ao mesmo tempo, por exemplo).
--
--  Correção: pg_advisory_xact_lock serializa chamadas concorrentes para o
--  MESMO bucket (chamadas de buckets DIFERENTES continuam livres, sem
--  nenhum lock entre si — o lock é uma chave hash do texto do bucket). É
--  escopo de TRANSAÇÃO (_xact_) — libera sozinho ao fim da transação
--  implícita de cada chamada RPC via PostgREST, sem risco de lock
--  esquecido preso. Com o lock, o SELECT count(*) + INSERT desta mesma
--  função passam a se comportar como se fossem atômicos: só uma chamada
--  por vez consegue de fato ler+decidir+escrever pra um bucket específico,
--  fechando a janela de corrida sem mudar o schema da tabela nem a lógica
--  de limpeza amortizada já existente.
-- ============================================================================

create or replace function public.check_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 then
    return true;  -- entrada inválida não deve trancar ninguém
  end if;

  -- Serializa chamadas concorrentes pro MESMO bucket — ver comentário acima.
  -- hashtextextended(text, seed) devolve bigint direto, sem precisar de cast.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

  -- Limpeza amortizada: fazer a cada chamada custaria caro, e um job agendado
  -- é infraestrutura a mais. 1% das chamadas mantém a tabela pequena.
  if random() < 0.01 then
    delete from public.rate_limit_hits
     where hit_at < now() - interval '1 hour';
  end if;

  select count(*)
    into v_count
    from public.rate_limit_hits
   where bucket = p_bucket
     and hit_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;
