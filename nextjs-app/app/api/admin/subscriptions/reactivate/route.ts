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
      .select('id, user_id, status, current_period_end')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })
    if (!sub) return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })

    // BUG CORRIGIDO (achado ao vivo, teste de estresse completo, 2026-09-01):
    // esta rota só existe pra desfazer um cancelamento AINDA dentro do
    // período já pago (cancel_at_period_end=true, mas profiles.plan_id/
    // plan_expires_at e user_secrets.plan continuam intocados até o período
    // acabar de verdade — só então enforce_plan_expiration os limpa). Ela
    // nunca restaurou plan_id/plan_expires_at/user_secrets.plan porque não
    // precisava — mas se o período já tiver terminado (seja porque o status
    // já virou 'expired', seja porque ainda está 'cancelled' mas o usuário
    // dono ainda não visitou /painel pra a checagem lazy rodar), reativar só
    // os campos de status produz um estado inconsistente: usuário "ativo"
    // sem plano nenhum atribuído, e o gateway já está cancelado/deletado pra
    // sempre do lado de lá (não tem cobrança nenhuma acontecendo por trás).
    // Bloqueia esse caso explicitamente em vez de produzir silenciosamente
    // um "ativo" fantasma — reativar uma assinatura de verdade expirada
    // exige um checkout novo, não um flip de status.
    const periodoJaTerminou = sub.current_period_end ? new Date(sub.current_period_end) < new Date() : false
    if (sub.status === 'expired' || periodoJaTerminou) {
      return NextResponse.json({
        error: 'O período pago desta assinatura já terminou — não é possível reativar apenas trocando o status (o gateway já cancelou a cobrança recorrente de verdade). Peça pro cliente assinar de novo pelo checkout.',
      }, { status: 409 })
    }

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
