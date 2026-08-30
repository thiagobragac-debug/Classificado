-- ============================================================================
--  institutional_pages sem policy de escrita versionada
-- ============================================================================
--
--  PROBLEMA (re-auditoria de segurança, 2026-08-30, achado alto)
--
--  institutional_pages é a única tabela gerenciada pelo painel admin que
--  nunca recebeu uma migration própria de RLS — só aparece em 20260827100000
--  (colunas _es) e em 20260830170000 (ENABLE ROW LEVEL SECURITY defensivo,
--  que reafirma o bit de RLS mas não garante nada sobre a POLICY em si).
--
--  A tabela precisa de leitura pública (app/(public)/institucional/page.tsx
--  lê via createAnonClient(), sem sessão — funciona hoje, então uma policy
--  de SELECT aberta já existe de algum jeito) e escrita só por admin
--  (app/(admin)/admin/paginas/page.tsx faz upsert/delete via client do
--  navegador). Sem confirmação da policy de ESCRITA no histórico, não dá
--  pra saber se ela é `is_admin()`-gated ou ficou aberta a qualquer
--  `authenticated` — mesmo padrão que já foi encontrado aberto por engano em
--  outras 3 tabelas deste projeto (is_admin(), messages, api_request_logs).
--
--  SOLUÇÃO
--
--  Reafirma SELECT público (mesmo comportamento de hoje, sem mudança) e
--  substitui qualquer policy de INSERT/UPDATE/DELETE existente — seja ela
--  ausente, correta ou aberta demais — pela policy padrão do projeto
--  (is_admin()). DOMPurify na escrita e na leitura (defesa em profundidade
--  já existente no código) continua intacto independente disso.
-- ============================================================================

alter table public.institutional_pages enable row level security;

drop policy if exists "Leitura pública de páginas institucionais" on public.institutional_pages;
create policy "Leitura pública de páginas institucionais" on public.institutional_pages
  for select using (true);

-- Rede de segurança: remove qualquer policy de INSERT/UPDATE/DELETE que não
-- seja a que vamos criar a seguir, independente do nome com que foi criada
-- (correta, ausente, ou aberta demais — não sabemos, por isso a rede).
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'institutional_pages'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on public.institutional_pages', pol.policyname);
  end loop;
end $$;

create policy "Admin gerencia páginas institucionais" on public.institutional_pages
  for all
  using (is_admin())
  with check (is_admin());
