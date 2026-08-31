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
import { getRequestLang } from '@/lib/api-lang'
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback'

// BUG CORRIGIDO (auditoria de i18n, achados de cliente): toda resposta desta
// rota (erro/sucesso) era hardcoded, a maioria em português e algumas em
// inglês — nunca lia tc_lang. BillingTab.tsx e PricingClientUI.tsx exibem
// data.message/data.error direto num alert/toast, então o texto cru sempre
// aparecia pro usuário final. Mesmo padrão já aplicado em checkout/*.
const ERRORS = {
  pt: {
    missingAuth: 'Cabeçalho de autorização ausente.',
    unauthorized: 'Não autorizado.',
    tooManyAttempts: 'Muitas tentativas. Aguarde um momento.',
    fetchSubError: 'Erro ao buscar assinatura.',
    noActiveSub: 'Nenhuma assinatura ativa encontrada.',
    stripeNotConfigured: 'Stripe não configurado.',
    mpNotConfigured: 'Mercado Pago não configurado.',
    pagarmeNotConfigured: 'Pagar.me não configurado.',
    asaasNotConfigured: 'Asaas não configurado.',
    gatewayNotSupported: (gatewayName: string) => `Gateway '${gatewayName}' não suportado.`,
    cancelFailed: 'Não foi possível cancelar a assinatura no momento. Tente novamente ou contate o suporte.',
    cancelSuccess: 'Assinatura cancelada com sucesso.',
    internal: 'Erro ao cancelar assinatura.',
  },
  es: {
    missingAuth: 'Falta el encabezado de autorización.',
    unauthorized: 'No autorizado.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento.',
    fetchSubError: 'Error al buscar la suscripción.',
    noActiveSub: 'No se encontró ninguna suscripción activa.',
    stripeNotConfigured: 'Stripe no está configurado.',
    mpNotConfigured: 'Mercado Pago no está configurado.',
    pagarmeNotConfigured: 'Pagar.me no está configurado.',
    asaasNotConfigured: 'Asaas no está configurado.',
    gatewayNotSupported: (gatewayName: string) => `Gateway '${gatewayName}' no compatible.`,
    cancelFailed: 'No se pudo cancelar la suscripción en este momento. Inténtalo de nuevo o contacta al soporte.',
    cancelSuccess: 'Suscripción cancelada con éxito.',
    internal: 'Error al cancelar la suscripción.',
  },
} as const

/**
 * POST /api/subscriptions/cancel
 *
 * Cancels the user active subscription at the gateway and marks it cancelled locally.
 * Auth: Bearer token in Authorization header.
 */
export async function POST(req: Request) {
  const lang = await getRequestLang()
  const tx = ERRORS[lang]
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: tx.missingAuth }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: tx.unauthorized }, { status: 401 })
    }

    // BUG CORRIGIDO (teste de estresse full-system, 2026-08-31): esta rota
    // não tinha rate limit, diferente dos demais irmãos de checkout/subscriptions.
    const permitido = await dentroDoLimiteFallback({
      bucket: `subscriptions_cancel_${user.id}`,
      limit: 10,
      logPrefix: 'subscriptions-cancel',
    })
    if (!permitido) {
      return NextResponse.json({ error: tx.tooManyAttempts }, { status: 429 })
    }

    // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial):
    // incluir 'pending' puro (sem checar gateway_subscription_id) tinha um
    // bug MAIS GRAVE do que o que resolvia — reproduzido ao vivo. Todo
    // checkout em voo grava um LOCK FANTASMA nesta mesma tabela
    // (app/api/checkout/route.ts, status:'pending', gateway_subscription_id
    // null, created_at=agora — ver comentário lá). Uma assinatura 'pending'
    // só é elegível aqui se JÁ tiver gateway_subscription_id — ou seja, se
    // realmente chegou a existir no gateway e só está esperando o webhook
    // de confirmação, não se é um lock ainda em voo ou órfão de um
    // checkout que nunca completou.
    //
    // BUG CORRIGIDO #2 (2ª rodada de revisão adversarial, achado
    // independente confirmado): mesmo excluindo o lock fantasma, uma única
    // query com `ORDER BY created_at DESC LIMIT 1` ainda tinha prioridade
    // errada — durante a janela de troca de plano nativa (cancelar-e-recriar,
    // app/api/checkout/route.ts), existe um estado transitório real de uma
    // linha 'pending' COM gateway_subscription_id (já criada no gateway, mas
    // ainda não confirmada pelo webhook) que é MAIS RECENTE que a assinatura
    // 'active' de verdade. Isso fazia o cancelamento escolher a linha
    // transitória em vez da assinatura ativa. A prioridade correta é por
    // classe de status (active/past_due sempre vence), não por recência —
    // por isso duas buscas sequenciais em vez de uma só com .or()+.order().
    let sub: { id: string; gateway: string; gateway_subscription_id: string | null; status: string; billing_cycle: string; plan: string } | null = null
    {
      const { data: ativa, error: ativaError } = await supabase
        .from('subscriptions')
        .select('id, gateway, gateway_subscription_id, status, billing_cycle, plan')
        .eq('user_id', user.id)
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ativaError) {
        console.error('[Cancel Subscription] Failed to fetch subscription:', ativaError.message)
        return NextResponse.json({ error: tx.fetchSubError }, { status: 500 })
      }

      if (ativa) {
        sub = ativa
      } else {
        const { data: pendente, error: pendenteError } = await supabase
          .from('subscriptions')
          .select('id, gateway, gateway_subscription_id, status, billing_cycle, plan')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .not('gateway_subscription_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pendenteError) {
          console.error('[Cancel Subscription] Failed to fetch subscription:', pendenteError.message)
          return NextResponse.json({ error: tx.fetchSubError }, { status: 500 })
        }
        sub = pendente
      }
    }

    if (!sub) {
      return NextResponse.json({ error: tx.noActiveSub }, { status: 404 })
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
          if (!settings['stripe_secret_key']) return NextResponse.json({ error: tx.stripeNotConfigured }, { status: 503 })
          adapter = stripeAdapter(settings['stripe_secret_key'])
          break
        case 'mercadopago':
          if (!settings['mp_access_token']) return NextResponse.json({ error: tx.mpNotConfigured }, { status: 503 })
          adapter = mercadoPagoAdapter(settings['mp_access_token'])
          break
        case 'pagarme':
          if (!settings['pagarme_api_key']) return NextResponse.json({ error: tx.pagarmeNotConfigured }, { status: 503 })
          adapter = pagarmeAdapter(settings['pagarme_api_key'])
          break
        case 'asaas':
          if (!settings['asaas_api_key']) return NextResponse.json({ error: tx.asaasNotConfigured }, { status: 503 })
          adapter = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox')
          break
        default:
          return NextResponse.json({ error: tx.gatewayNotSupported(gatewayName) }, { status: 400 })
      }

      try {
        await adapter.cancelSubscription(sub.gateway_subscription_id)
      } catch (gatewayErr: any) {
        // BUG CORRIGIDO (validação do zero, 3ª rodada): o corpo cru do erro do
        // gateway (ex.: request_log_url e account id da Stripe) vazava pro
        // cliente via o catch externo — mesma classe já corrigida em
        // checkout/route.ts, replicada aqui.
        console.error('[Cancel Subscription] Gateway error:', gatewayErr.message)
        return NextResponse.json({ error: tx.cancelFailed }, { status: 502 })
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
      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): a
      // guarda detectava a corrida (0 linhas afetadas) mas o código seguia
      // escrevendo profiles.subscription_status='cancelled' de qualquer
      // jeito, incondicionalmente, alguns milissegundos depois. Detectar a
      // corrida sem impedir a escrita seguinte não protege nada — agora, se
      // o cancelamento no gateway já aconteceu de verdade mas o UPDATE local
      // não pegou a linha esperada, ainda respondemos sucesso (o gateway já
      // foi cancelado, não tem como dizer "falhou" pro usuário), mas SEM
      // sobrescrever profiles/user_secrets — o estado real da assinatura
      // (o que quer que outra operação concorrente tenha gravado) prevalece,
      // e fica só o log para revisão manual.
      console.error(`[Cancel Subscription] Assinatura ${sub.id} já cancelada no gateway, mas o status local mudou entre a leitura e a escrita (esperado '${sub.status}') — revisão manual necessária, profiles NÃO sobrescrito.`)
      return NextResponse.json({ success: true, message: tx.cancelSuccess })
    }

    // Do NOT downgrade plan to 'free' yet. The user has paid for the current period.
    // The dynamic expiry check will downgrade them when plan_expires_at is reached.
    await supabase.from('profiles').update({ subscription_status: 'cancelled' }).eq('id', user.id)

    return NextResponse.json({ success: true, message: tx.cancelSuccess })

  } catch (err: any) {
    console.error('[Cancel Subscription] Error:', err)
    return NextResponse.json({ error: tx.internal }, { status: 500 })
  }
}
