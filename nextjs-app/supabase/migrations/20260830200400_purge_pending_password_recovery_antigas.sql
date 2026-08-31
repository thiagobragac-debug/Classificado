-- ============================================================================
--  pending_password_recovery acumulava linhas órfãs indefinidamente
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança independente, 2026-08-30, achado baixo)
--
--  A linha desta tabela só é apagada em dois caminhos do app: troca de senha
--  bem-sucedida, e agora também o botão "voltar" (AuthContainer.tsx). Fechar
--  a aba sem completar nenhum dos dois fluxos deixa a linha para sempre —
--  sem impacto de segurança direto (a sessão em si expira normalmente),
--  mas é crescimento não controlado de uma tabela, ao contrário de outras
--  tabelas do projeto com o mesmo padrão de higiene (purga de
--  api_request_logs, expiração de assinaturas pendentes).
--
--  SOLUÇÃO: purga diária de linhas mais antigas que 24h — bem acima do TTL
--  real de qualquer link de recuperação de senha do Supabase Auth (1h por
--  padrão), então nunca apaga uma sessão de recuperação ainda válida.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_old_pending_password_recovery()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pending_password_recovery
   where created_at < now() - interval '24 hours';
end;
$$;

select cron.schedule(
  'purge-old-pending-password-recovery',
  '15 3 * * *',
  $$select public.purge_old_pending_password_recovery()$$
);
