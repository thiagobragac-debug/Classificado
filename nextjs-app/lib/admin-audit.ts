import type { SupabaseClient } from '@supabase/supabase-js'

// BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25): não
// existia nenhum registro de quem fez o quê no painel admin. Chama a RPC
// log_admin_action (migration 20260925232000) usando o client ESCOPADO NA
// SESSÃO DO ADMIN (nunca o client de service_role) — é o que faz
// auth.uid() dentro da RPC resolver pro admin real que fez a chamada, não
// nulo. Falha ao registrar o log NUNCA deve derrubar a ação principal
// (bloquear usuário, cancelar assinatura etc.) já concluída com sucesso —
// só loga o erro pro console pra não passar despercebido.
export async function logAdminAction(
  supabase: SupabaseClient,
  action: string,
  targetType: string,
  targetId?: string | null,
  details?: Record<string, unknown> | null
): Promise<void> {
  const { error } = await supabase.rpc('log_admin_action', {
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId ?? null,
    p_details: details ?? null,
  })
  if (error) {
    console.error(`[admin-audit] Falha ao registrar ação "${action}" em "${targetType}":`, error.message)
  }
}
