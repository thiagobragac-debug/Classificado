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
      // BUG CORRIGIDO (validação do zero, rodada 6): faltava 'pending' aqui —
      // uma assinatura real presa em 'pending' (ex: Stripe ainda processando,
      // ou webhook de ativação nunca chegou) ficava invisível pro
      // autocancelamento, retornando 404 pro cliente mesmo ele podendo estar
      // sendo cobrado de verdade.
      .in('status', ['active', 'past_due', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      console.error('[Cancel Subscription] Failed to fetch subscription:', subError.message)
      return NextResponse.json({ error: 'Erro ao buscar assinatura.' }, { status: 500 })
    }
    if (!sub) {
      return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 404 })
    }

    // BUG CORRIGIDO (validação do zero, rodada 6): assinaturas criadas via
    // cupom de 100% de desconto nunca têm gateway_subscription_id (não existe
    // cobrança nenhuma pra cancelar num gateway) — isso bloqueava o
    // autocancelamento delas pra sempre com "Contate o suporte". Sem gateway
    // associado, o cancelamento é só local — pula direto pro UPDATE abaixo.
    if (sub.gateway_subscription_id) {
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

      try {
        await adapter.cancelSubscription(sub.gateway_subscription_id)
      } catch (gatewayErr: any) {
        // BUG CORRIGIDO (validação do zero, 3ª rodada): o corpo cru do erro do
        // gateway (ex.: request_log_url e account id da Stripe) vazava pro
        // cliente via o catch externo — mesma classe já corrigida em
        // checkout/route.ts, replicada aqui.
        console.error('[Cancel Subscription] Gateway error:', gatewayErr.message)
        return NextResponse.json({ error: 'Não foi possível cancelar a assinatura no momento. Tente novamente ou contate o suporte.' }, { status: 502 })
      }
    }

    // --- Update local DB ---
    // BUG CORRIGIDO (validação do zero, rodada 6): o UPDATE não checava se o
    // status ainda era o mesmo lido no SELECT do topo — uma troca de plano
    // concorrente (app/api/checkout/route.ts) podia ter mudado a linha nesse
    // meio-tempo. Condicionar com .eq('status', sub.status) fecha essa janela
    // TOCTOU: se zero linhas forem afetadas, o gateway já foi cancelado de
    // verdade (não faz sentido dizer que a operação falhou), mas o estado
    // local pode precisar de revisão manual — loga como erro real.
    const now = new Date().toISOString()
    const { data: cancelResult } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', cancel_at_period_end: true, updated_at: now })
      .eq('id', sub.id)
      .eq('status', sub.status)
      .select('id')

    if (!cancelResult || cancelResult.length === 0) {
      console.error(`[Cancel Subscription] Assinatura ${sub.id} já cancelada no gateway, mas o status local mudou entre a leitura e a escrita (esperado '${sub.status}') — revisão manual necessária.`)
    }

    // Do NOT downgrade plan to 'free' yet. The user has paid for the current period.
    // The dynamic expiry check will downgrade them when plan_expires_at is reached.
    await supabase.from('profiles').update({ subscription_status: 'cancelled' }).eq('id', user.id)

    return NextResponse.json({ success: true, message: 'Assinatura cancelada com sucesso.' })

  } catch (err: any) {
    console.error('[Cancel Subscription] Error:', err)
    return NextResponse.json({ error: 'Erro ao cancelar assinatura.' }, { status: 500 })
  }
}
