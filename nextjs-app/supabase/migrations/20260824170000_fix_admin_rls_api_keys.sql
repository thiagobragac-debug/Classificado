-- Mesma classe de bug do commit 4800e66 (profiles.is_admin, nunca setado
-- por nenhum fluxo real de "tornar alguém admin" — ver
-- 20260824150000_fix_admin_rls_profiles_to_user_secrets.sql), encontrada
-- agora em api_keys e api_request_logs: "Gerar Nova Chave" em
-- /admin/api-keys sempre retornava sucesso na tela, mas nenhuma linha era
-- criada (confirmado testando com admin real: 0 chaves no banco após
-- "gerar").

drop policy if exists "Admin full access on api_keys" on public.api_keys;
create policy "Admin full access on api_keys" on public.api_keys
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "Admin read on api_request_logs" on public.api_request_logs;
create policy "Admin read on api_request_logs" on public.api_request_logs
  for select
  using (is_admin());
