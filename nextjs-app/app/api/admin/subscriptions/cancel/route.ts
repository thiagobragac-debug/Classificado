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
      try {
        await adapter.cancelSubscription(sub.gateway_subscription_id)
      } catch (gatewayErr: any) {
        // BUG CORRIGIDO (validação do zero, rodada 6): mesma classe de bug já
        // corrigida em /api/subscriptions/cancel — o erro cru do gateway (ex.:
        // request_log_url e account id da Stripe) vazava pro admin via o
        // catch externo desta função, que devolve err.message direto.
        console.error('[Admin Cancel Subscription] Gateway error:', gatewayErr.message)
        return NextResponse.json({ error: 'Não foi possível cancelar a assinatura no momento. Tente novamente ou contate o suporte.' }, { status: 502 })
      }
    }

    // BUG CORRIGIDO (validação do zero, rodada 6): mesma race TOCTOU do
    // /api/subscriptions/cancel — condiciona o UPDATE ao status ainda ser o
    // mesmo lido no SELECT do topo, fechando a janela de corrida com uma
    // troca de plano concorrente em app/api/checkout/route.ts.
    const now = new Date().toISOString()
    const { data: cancelResult } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled', cancel_at_period_end: true, updated_at: now })
      .eq('id', sub.id)
      .eq('status', sub.status)
      .select('id')

    if (!cancelResult || cancelResult.length === 0) {
      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): a
      // guarda detectava a corrida (0 linhas afetadas) mas o código seguia
      // escrevendo profiles.subscription_status='cancelled' incondicionalmente
      // de qualquer jeito — detectar sem impedir a escrita seguinte não
      // protegia nada. Mesma correção de /api/subscriptions/cancel.
      //
      // BUG CORRIGIDO (aplicação de todos os achados de baixa prioridade
      // pendentes): esta mensagem de log dizia "já cancelada no gateway"
      // incondicionalmente, mas a chamada ao gateway só acontece acima
      // quando `sub.gateway_subscription_id` existe (linha ~67) — uma
      // assinatura sem gateway (ex.: cupom de 100%) nunca teve gateway
      // nenhum pra cancelar, então afirmar isso é enganoso pra quem lê o
      // log tentando diagnosticar o que realmente aconteceu.
      const contextoGateway = sub.gateway_subscription_id
        ? 'já cancelada no gateway'
        : 'sem gateway associado (nada a cancelar remotamente)'
      console.error(`[Admin Cancel Subscription] Assinatura ${sub.id} (${contextoGateway}), mas o status local mudou entre a leitura e a escrita (esperado '${sub.status}') — revisão manual necessária, profiles NÃO sobrescrito.`)
      return NextResponse.json({ success: true })
    }

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
