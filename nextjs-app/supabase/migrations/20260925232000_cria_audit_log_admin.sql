-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25):
-- não existe nenhum sistema de audit log no projeto — nenhuma ação admin
-- (bloquear/desbloquear usuário, aprovar/rejeitar KYC, banir anúncio,
-- cancelar/reativar assinatura de outro usuário, convidar usuário, editar
-- chaves de gateway em platform_settings) grava quem fez o quê e quando.
-- Se uma ação indevida acontecer (admin comprometido via XSS/cookie
-- roubado, ou erro humano), não há como reconstruir qual admin fez nem
-- quando — só o estado final no banco.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_admin_id on public.admin_audit_log(admin_id);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log(target_type, target_id);

alter table public.admin_audit_log enable row level security;

-- Só admin lê (histórico de ações administrativas é dado sensível — revela
-- quem fez o quê a quem). Ninguém edita/apaga via API (grants abaixo não
-- liberam UPDATE/DELETE nem pra authenticated) — só INSERT via a RPC
-- SECURITY DEFINER abaixo, que ninguém além do próprio código do app chama.
drop policy if exists "Admins leem o audit log" on public.admin_audit_log;
create policy "Admins leem o audit log"
on public.admin_audit_log for select
using (public.is_admin());

-- RPC em vez de INSERT direto do client: admin_id vem SEMPRE de auth.uid()
-- internamente (nunca do parâmetro do chamador) — um admin não pode forjar
-- log em nome de outro admin, nem inserir um registro sem ser admin de verdade.
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id text default null,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem registrar ações de auditoria.' using errcode = '42501';
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_details);
end;
$function$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;
