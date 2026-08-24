import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Lista usuários para o admin (Gerenciar Usuários).
//
// BUG CORRIGIDO: a página fazia essa consulta direto do browser com
// getSupabase() (cliente anon, sujeito a RLS). A RLS de user_secrets só
// libera auth.uid() = id — ou seja, o admin só via o PRÓPRIO user_secrets,
// e o join `user_secrets(is_blocked, plan, email)` vinha `null` para
// qualquer outro usuário. Resultado real: "Assinantes" sempre mostrava 0 e
// nenhum usuário real (fora o próprio admin) jamais tinha seu plano/status
// de bloqueio exibidos corretamente, mesmo com assinaturas pagas de
// verdade no banco. Mesmo motivo pelo qual /api/admin/block-user já existe
// como rota de servidor em vez de escrita direta do browser.
function planLabel(raw: string | null | undefined) {
  const p = (raw || '').toLowerCase()
  if (p === 'premium') return 'Premium'
  if (p === 'pro') return 'Pro'
  return 'Grátis'
}

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
    .from('profiles')
    .select('*, user_secrets(is_blocked, plan, email), ads(count)')
    .order('created_at', { ascending: false })
    .limit(1500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (data || []).map((u: any) => ({
    ...u,
    is_blocked: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.is_blocked : u.user_secrets?.is_blocked,
    plan: planLabel(Array.isArray(u.user_secrets) ? u.user_secrets[0]?.plan : u.user_secrets?.plan),
    email: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.email : u.user_secrets?.email,
    ads_count: Array.isArray(u.ads) ? u.ads[0]?.count : (u.ads?.count || 0),
    user_secrets: undefined,
    ads: undefined,
  }))

  return NextResponse.json({ users })
}
