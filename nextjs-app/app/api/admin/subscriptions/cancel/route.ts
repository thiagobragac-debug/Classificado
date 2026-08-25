import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import {
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayAdapter,
  GatewayName,
} from '@/lib/gateways'

// BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): o botão
// "Cancelar" de app/(admin)/admin/assinaturas/page.tsx fazia só
// `subscriptions.update({status: 'canceled'})` direto do cliente — nunca
// cancelava de verdade no gateway (continuaria cobrando/renovando lá) nem
// tocava profiles/user_secrets, então o usuário mantinha o plano pago ativo
// indefinidamente mesmo com a assinatura "cancelada" no admin. Esta rota
// espelha a lógica real de /api/subscriptions/cancel (usada pelo próprio
// usuário), só que autenticada como admin e agindo sobre a assinatura de
// QUALQUER usuário. Chamar o gateway exige a secret key — por isso não dá
// para fazer isso direto do cliente, só de uma rota de servidor.
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
      .select('id, user_id, gateway, gateway_subscription_id, status')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })
    if (!sub) return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })

    if (sub.status === 'cancelled') {
      return NextResponse.json({ success: true, message: 'Assinatura já estava cancelada.' })
    }

    // Cancela de verdade no gateway antes de mexer no nosso banco — se isso
    // falhar, a ação inteira falha (melhor um admin ver o erro e tentar de
    // novo do que achar que cancelou enquanto o gateway continua cobrando).
    if (sub.gateway_subscription_id) {
      const settings = await getSettings(admin)
      let adapter: GatewayAdapter
      const gatewayName = sub.gateway as GatewayName
      switch (gatewayName) {
        case 'stripe':
          if (!settings['stripe_secret_key']) return NextResponse.json({ error: 'Stripe não configurado.' }, { status: 503 })
          adapter = stripeAdapter(settings['stripe_secret_key'])
          break
        case 'mercadopago':
          if (!settings['mp_access_token']) return NextResponse.json({ error: 'Mercado Pago não configurado.' }, { status: 503 })
          adapter = mercadoPagoAdapter(settings['mp_access_token'])
          break
        case 'pagarme':
          if (!settings['pagarme_api_key']) return NextResponse.json({ error: 'Pagar.me não configurado.' }, { status: 503 })
          adapter = pagarmeAdapter(settings['pagarme_api_key'])
          break
        case 'asaas':
          if (!settings['asaas_api_key']) return NextResponse.json({ error: 'Asaas não configurado.' }, { status: 503 })
          adapter = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox')
          break
        default:
          return NextResponse.json({ error: `Gateway '${gatewayName}' não suportado.` }, { status: 400 })
      }
      await adapter.cancelSubscription(sub.gateway_subscription_id)
    }

    const now = new Date().toISOString()
    await admin.from('subscriptions').update({ status: 'cancelled', cancel_at_period_end: true, updated_at: now }).eq('id', sub.id)

    // Não derruba o plano na hora — o usuário já pagou o período corrente.
    // enforce_plan_expiration() (chamada em app/(public)/painel/page.tsx)
    // faz o downgrade de verdade quando plan_expires_at vencer, mesma lógica
    // já usada em /api/subscriptions/cancel.
    await admin.from('profiles').update({ subscription_status: 'cancelled' }).eq('id', sub.user_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Admin Cancel Subscription] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao cancelar assinatura.' }, { status: 500 })
  }
}
