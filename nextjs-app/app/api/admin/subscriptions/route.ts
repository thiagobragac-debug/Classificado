import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Lista assinaturas para o admin (Gestão de Assinaturas).
//
// BUG CORRIGIDO (validação de 2026-08-26): a página fazia essa consulta
// direto do browser com getSupabase() (cliente anon, sujeito a RLS). A
// RLS de user_secrets só libera auth.uid() = id — o admin só via o
// PRÓPRIO e-mail, e o embed profiles!user_id(user_secrets(email)) vinha
// null para qualquer outro assinante. Coluna "Usuário" sempre mostrava
// "-". Mesmo bug de classe já corrigido para /admin/usuarios
// (app/api/admin/users/route.ts) — nunca tinha sido replicado aqui.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscriptions')
    .select('*, profiles!user_id(name, user_secrets(email))')
    // BUG CORRIGIDO (validação do zero, 4ª rodada): 'switch_applied' é o
    // marcador terminal que o lock de idempotência do checkout deixa pra
    // trás depois de uma troca nativa de plano bem-sucedida (nunca mais é
    // apagado, de propósito — ver comentário em app/api/checkout/route.ts).
    // Sem este filtro, cada troca de plano nativa infla "Total" com uma
    // linha zumbi (sem gateway_subscription_id, sem ação disponível) para
    // sempre.
    .neq('status', 'switch_applied')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const subscriptions = (data || []).map((sub: any) => ({
    ...sub,
    profiles: sub.profiles ? {
      ...sub.profiles,
      email: Array.isArray(sub.profiles.user_secrets)
        ? sub.profiles.user_secrets[0]?.email
        : sub.profiles.user_secrets?.email,
      user_secrets: undefined,
    } : null,
  }))

  return NextResponse.json({ subscriptions })
}
