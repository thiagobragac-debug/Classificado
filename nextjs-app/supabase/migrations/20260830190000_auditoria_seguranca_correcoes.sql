-- ============================================================
-- Correções da auditoria de segurança de 2026-08-30 (client+admin)
--
-- Todos os achados abaixo foram confirmados por introspecção direta
-- do banco de produção (`supabase db advisors --linked` + queries em
-- pg_proc/pg_policies/information_schema), não só leitura de código.
-- Nenhuma das alterações aqui tinha migration própria até agora —
-- os itens 1 e 2 nem existiam em nenhum arquivo deste diretório,
-- ou seja, foram criados fora do pipeline de versionamento.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1) CRÍTICO: get_backend_secrets(token text)
-- ────────────────────────────────────────────────────────────
-- Devolvia TODA a tabela platform_settings (stripe_secret_key,
-- mp_access_token, pagarme_api_key, asaas_api_key, os 4 webhook
-- secrets) mediante uma senha hardcoded no próprio corpo da
-- função ('TauzeBackendSecret2026'), exposta publicamente via
-- /rest/v1/rpc/get_backend_secrets para qualquer usuário — anon
-- incluído (SECURITY DEFINER + EXECUTE liberado para anon/
-- authenticated, confirmado no advisor). Zero uso no código do
-- app (grep completo em app/lib/components: nenhuma ocorrência).
-- As chaves em platform_settings devem ser tratadas como
-- comprometidas e rotacionadas manualmente nos painéis de cada
-- gateway — isso não pode ser feito por uma migration.
drop function if exists public.get_backend_secrets(text);

-- ────────────────────────────────────────────────────────────
-- 2) ALTO: grant_admin(target_email text)
-- ────────────────────────────────────────────────────────────
-- Checa e escreve profiles.is_admin — coluna zumbi desde
-- 20260723072100_split_user_secrets.sql moveu a fonte real de
-- privilégio de admin para user_secrets.is_admin (é isso que
-- is_admin() checa, e o que proxy.ts/layout admin usam). Hoje é
-- inofensiva: ninguém mais consegue setar profiles.is_admin=true
-- (UPDATE da coluna já revogado em 20260824190000; sem policy de
-- INSERT que um usuário comum explore) — mas é código morto,
-- desalinhado com o modelo de privilégio atual, sem uso no app e
-- sem registro em migration nenhuma. Mesmo destino do item 1.
drop function if exists public.grant_admin(text);

-- ────────────────────────────────────────────────────────────
-- 3) CRÍTICO: ads_archive sem RLS e com GRANT público total
-- ────────────────────────────────────────────────────────────
-- RLS desabilitada + GRANT de tabela completo (SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE) para anon e authenticated: qualquer
-- visitante não autenticado podia ler, forjar, alterar ou apagar
-- (inclusive TRUNCATE) todo o histórico de anúncios arquivados via
-- API pública do PostgREST. Único escritor real é o Edge Function
-- data-retention-job (usa SUPABASE_SERVICE_ROLE_KEY — confirmado
-- no código dele), que bypassa RLS e mantém GRANT próprio,
-- independente do que é revogado abaixo.
alter table public.ads_archive enable row level security;
revoke all on public.ads_archive from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 4) MÉDIO: profiles.is_admin / is_blocked — GRANT residual
-- ────────────────────────────────────────────────────────────
-- 20260824190000 já revogou o UPDATE dessas colunas para
-- anon/authenticated, mas o INSERT e REFERENCES ficaram de fora.
-- Sem policy de INSERT que um usuário comum use hoje contra isso,
-- mas é permissão desnecessária em colunas de privilégio —
-- revogada por defesa em profundidade (evita que uma futura policy
-- de INSERT mal desenhada reabra o vetor sem ninguém perceber).
revoke insert (is_admin, is_blocked), references (is_admin, is_blocked)
  on public.profiles from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 5) BAIXO: views SECURITY DEFINER
-- ────────────────────────────────────────────────────────────
-- top_sellers_view e public_profiles rodam com o privilégio de
-- quem criou a view, não de quem consulta (bypass de RLS latente,
-- sinalizado como ERROR pelo linter). Conteúdo revisado: só
-- expõem campos já públicos (nome, avatar, cidade, verificado,
-- contagem de anúncios) e a RLS de profiles ("Public profiles are
-- viewable by everyone") e ads ("Active ads are viewable by
-- everyone") já libera os mesmos dados para anon/authenticated —
-- trocar para SECURITY INVOKER não muda comportamento observável
-- nenhum, só remove o bypass de RLS que não tinha propósito real.
alter view public.top_sellers_view set (security_invoker = true);
alter view public.public_profiles set (security_invoker = true);

-- ────────────────────────────────────────────────────────────
-- 6) BAIXO: search_path mutável em funções SECURITY DEFINER
-- ────────────────────────────────────────────────────────────
-- Dezenas de funções SECURITY DEFINER em public não fixavam
-- search_path — vetor teórico de search_path hijacking se algum
-- role conseguisse criar objetos num schema anterior no path da
-- sessão. Corrige em lote, de forma idempotente, todas as
-- SECURITY DEFINER de public ainda sem search_path configurado.
-- Não muda lógica nenhuma: todas já assumem 'public' implicitamente
-- (é o schema onde tudo delas mora), só passa a fixar isso
-- explicitamente. get_backend_secrets/grant_admin já foram
-- removidas acima, então nem entram neste loop.
do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public', r.proname, r.args);
  end loop;
end $$;

commit;

-- ────────────────────────────────────────────────────────────
-- Itens da auditoria intencionalmente NÃO tratados nesta migration:
--
-- • Extensões unaccent/pg_trgm no schema public (WARN cosmético do
--   linter): mover de schema exigiria recriar índices/funções que
--   dependem delas (ex.: índices GIN com gin_trgm_ops usados na
--   busca) — risco real de quebrar busca textual em produção por
--   um achado de severidade baixa. Deixado para uma janela de
--   manutenção dedicada, com os índices dependentes mapeados antes.
--
-- • "Leaked Password Protection" desativado no Supabase Auth: não é
--   uma alteração de schema — é config do projeto (Management API /
--   Dashboard), tratada separadamente fora desta migration.
--
-- • Segredos de webhook vazios em platform_settings (stripe/mp/
--   pagarme/asaas): exige inserir as credenciais reais de cada
--   gateway — ação manual do time, uma migration não pode carregar
--   segredo nenhum.
--
-- • Rotação das chaves de platform_settings potencialmente
--   expostas via get_backend_secrets (item 1): ação manual nos
--   painéis de cada gateway, fora do escopo de uma migration SQL.
-- ────────────────────────────────────────────────────────────
