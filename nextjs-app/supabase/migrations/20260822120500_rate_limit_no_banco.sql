-- ============================================================================
--  Rate limiting com estado no banco, sem depender de infraestrutura opcional
-- ============================================================================
--
--  PROBLEMA
--
--  proxy.ts limitava /login e /auth via Upstash Redis. As variáveis
--  UPSTASH_REDIS_REST_URL/TOKEN estão comentadas no .env.local e, pior, os
--  valores ali são placeholders (`xxxx.upstash.io`, token de 9 caracteres).
--  Sem elas o objeto Ratelimit nunca é criado e o bloco inteiro vira no-op:
--  o login ficou sem proteção contra força bruta desde a migração para proxy.
--
--  Descomentar não resolveria — não há credencial real. E um contador em
--  memória no processo também não serve: em serverless cada instância teria o
--  próprio contador, e o atacante só precisa cair em instâncias diferentes.
--
--  SOLUÇÃO
--
--  Janela deslizante no Postgres, que é o único estado compartilhado que a
--  aplicação já tem garantido. Mesmo padrão que lib/api-auth.ts já usa como
--  fallback do rate limit da API v1.
--
--  O Upstash continua tendo precedência quando configurado: é mais rápido e
--  não gasta conexão do banco. Isto é a rede de segurança para quando não
--  estiver.
-- ============================================================================

create table if not exists public.rate_limit_hits (
  id     bigserial primary key,
  bucket text        not null,
  hit_at timestamptz not null default now()
);

-- A consulta é sempre "quantos hits deste bucket na última janela".
create index if not exists idx_rate_limit_hits_bucket_time
  on public.rate_limit_hits (bucket, hit_at desc);

alter table public.rate_limit_hits enable row level security;

-- Nenhuma policy de propósito: a tabela só é tocada pela função abaixo, que é
-- SECURITY DEFINER. Nem anon nem authenticated leem ou escrevem direto.

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

-- Precisa ser chamável antes do login, então anon entra na lista.
-- Chamar diretamente só permite ao atacante gastar a própria cota.
grant execute on function public.check_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;
