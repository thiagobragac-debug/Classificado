-- ============================================================================
--  platform_settings expõe segredos de gateway a qualquer sessão admin via RLS
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança, 2026-08-30, achado alto)
--
--  platform_settings é uma tabela key/value (colunas `key`, `value`). A única
--  policy existente ("Admins gerenciam configurações", criada em
--  20260824180000) é `for all using (is_admin())` — sem nenhuma restrição por
--  linha, ou seja, um is_admin=true enxerga TODAS as linhas, incluindo as 8
--  chaves secretas de gateway de pagamento (stripe/mp/pagarme/asaas) listadas
--  em lib/secret-settings.ts.
--
--  A proteção real contra vazamento desses segredos hoje existe só na camada
--  de aplicação: app/api/admin/settings/route.ts filtra os valores antes de
--  responder, e components/Header.tsx exclui as mesmas chaves na query. Mas
--  como Header.tsx já usa um client Supabase autenticado no navegador, um XSS
--  no painel admin (ou uma extensão de navegador maliciosa) rodando com a
--  sessão de um admin logado pode simplesmente ignorar esse filtro e chamar
--  `supabase.from('platform_settings').select('*')` direto — RLS permite,
--  porque is_admin() é verdadeiro, devolvendo os 4 segredos de gateway em
--  texto puro.
--
--  SOLUÇÃO
--
--  Restringe a policy pra excluir as linhas de segredo, no próprio banco. Não
--  quebra nenhum fluxo legítimo: o único código que lê ou grava os valores
--  reais desses segredos (app/api/admin/settings/route.ts, GET e POST) já usa
--  createAdminClient() — service_role, que sempre contorna RLS. Nenhum fluxo
--  da aplicação depende de enxergar essas linhas pela policy de admin.
-- ============================================================================

create or replace function public.is_secret_setting_key(k text)
returns boolean
language sql
immutable
as $$
  -- Mesma lista de lib/secret-settings.ts (SECRET_SETTING_KEYS) — se uma
  -- chave secreta nova for criada, precisa entrar nos dois lugares.
  select k = any (array[
    'stripe_secret_key', 'stripe_webhook_secret',
    'mp_access_token', 'mp_webhook_secret',
    'pagarme_api_key', 'pagarme_webhook_secret',
    'asaas_api_key', 'asaas_webhook_token'
  ]);
$$;

drop policy if exists "Admins gerenciam configurações" on public.platform_settings;

create policy "Admins leem configurações não sensíveis" on public.platform_settings
  for select
  using (is_admin() and not is_secret_setting_key(key));

create policy "Admins criam configurações não sensíveis" on public.platform_settings
  for insert
  with check (is_admin() and not is_secret_setting_key(key));

create policy "Admins atualizam configurações não sensíveis" on public.platform_settings
  for update
  using (is_admin() and not is_secret_setting_key(key))
  with check (is_admin() and not is_secret_setting_key(key));

create policy "Admins removem configurações não sensíveis" on public.platform_settings
  for delete
  using (is_admin() and not is_secret_setting_key(key));
