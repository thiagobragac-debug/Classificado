import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import {
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayAdapter,
  GatewayName,
} from '@/lib/gateways'

/**
 * POST /api/subscriptions/cancel
 *
 * Cancels the user active subscription at the gateway and marks it cancelled locally.
 * Auth: Bearer token in Authorization header.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('id, gateway, gateway_subscription_id, status, billing_cycle, plan')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      return NextResponse.json({ error: 'Erro ao buscar assinatura: ' + subError.message }, { status: 500 })
    }
    if (!sub) {
      return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 404 })
    }
    if (!sub.gateway_subscription_id) {
      return NextResponse.json({ error: 'ID da assinatura no gateway nao encontrado. Contate o suporte.' }, { status: 400 })
    }

    const settings = await getSettings(supabase)
    let adapter: GatewayAdapter

    const gatewayName = sub.gateway as GatewayName
    switch (gatewayName) {
      case 'stripe':
        if (!settings['stripe_secret_key']) return NextResponse.json({ error: 'Stripe nao configurado.' }, { status: 503 })
        adapter = stripeAdapter(settings['stripe_secret_key'])
        break
      case 'mercadopago':
        if (!settings['mp_access_token']) return NextResponse.json({ error: 'Mercado Pago nao configurado.' }, { status: 503 })
        adapter = mercadoPagoAdapter(settings['mp_access_token'])
        break
      case 'pagarme':
        if (!settings['pagarme_api_key']) return NextResponse.json({ error: 'Pagar.me nao configurado.' }, { status: 503 })
        adapter = pagarmeAdapter(settings['pagarme_api_key'])
        break
      case 'asaas':
        if (!settings['asaas_api_key']) return NextResponse.json({ error: 'Asaas nao configurado.' }, { status: 503 })
        adapter = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox')
        break
      default:
        return NextResponse.json({ error: `Gateway '${gatewayName}' nao suportado.` }, { status: 400 })
    }

    await adapter.cancelSubscription(sub.gateway_subscription_id)

    // --- Update local DB ---
    const now = new Date().toISOString()
    await supabase.from('subscriptions').update({ status: 'cancelled', cancel_at_period_end: true, updated_at: now }).eq('id', sub.id)
    
    // Do NOT downgrade plan to 'free' yet. The user has paid for the current period.
    // The dynamic expiry check will downgrade them when plan_expires_at is reached.
    await supabase.from('profiles').update({ subscription_status: 'cancelled' }).eq('id', user.id)

    return NextResponse.json({ success: true, message: 'Assinatura cancelada com sucesso.' })

  } catch (err: any) {
    console.error('[Cancel Subscription] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao cancelar assinatura.' }, { status: 500 })
  }
}
