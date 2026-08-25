import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// BUG ALTO CORRIGIDO (reteste do site, 2026-08-25): o botão "Reativar" de
// app/(admin)/admin/assinaturas/page.tsx escrevia profiles.subscription_status
// direto do cliente (anon key) — mas a migration 20260824190000 (restrição de
// colunas privilegiadas de profiles) não incluiu subscription_status na lista
// de colunas que o próprio usuário pode gravar, e "admin" aqui ainda é só o
// role Postgres `authenticated`, sem privilégio extra algum a nível de banco.
// A escrita falhava sempre com 42501 (permission denied), o erro nunca era
// checado, e o toast "Assinatura reativada." aparecia mesmo assim — deixando
// profiles.subscription_status desincronizado de subscriptions.status pra
// sempre. Espelha o mesmo padrão já usado em .../cancel/route.ts: só uma
// rota de servidor com service_role pode escrever essa coluna.
async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { erro: null }
}

export async function POST(request: Request) {
  try {
    const { erro } = await exigirAdmin()
    if (erro) return erro

    const { subscriptionId } = await request.json()
    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId é obrigatório' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: sub, error: subError } = await admin
      .from('subscriptions')
      .select('id, user_id')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })
    if (!sub) return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })

    const now = new Date().toISOString()
    const { error: updateSubErr } = await admin
      .from('subscriptions')
      .update({ status: 'active', cancel_at_period_end: false, updated_at: now })
      .eq('id', sub.id)
    if (updateSubErr) return NextResponse.json({ error: updateSubErr.message }, { status: 500 })

    const { error: updateProfileErr } = await admin
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', sub.user_id)
    if (updateProfileErr) return NextResponse.json({ error: updateProfileErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Admin Reactivate Subscription] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao reativar assinatura.' }, { status: 500 })
  }
}
