import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { selectGateway, isNativePlanSwitchEligible } from '@/lib/gateways'
import { getRequestLang } from '@/lib/api-lang'
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback'

// BUG CORRIGIDO (validação do zero, rodada 6): toda mensagem de erro desta
// rota voltava em português (ou em inglês, no caso da auth) regardless do
// idioma ativo — `country`, que decide se o fluxo Stripe é alcançado, é
// editável pelo próprio usuário no perfil, então isto é facilmente
// alcançável por qualquer usuário em espanhol.
const ERRORS = {
  pt: {
    missingAuth: 'Cabeçalho de autorização ausente.',
    unauthorized: 'Não autorizado.',
    tooManyAttempts: 'Muitas tentativas. Aguarde um momento.',
    stripeNotConfigured: 'Stripe não configurado.',
    mpNotConfigured: 'Mercado Pago não configurado.',
    stripeInitFailed: 'Não foi possível iniciar o checkout no momento. Tente novamente ou contate o suporte.',
    internal: 'Erro interno. Tente novamente.',
  },
  es: {
    missingAuth: 'Falta el encabezado de autorización.',
    unauthorized: 'No autorizado.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento.',
    stripeNotConfigured: 'Stripe no está configurado.',
    mpNotConfigured: 'Mercado Pago no está configurado.',
    stripeInitFailed: 'No se pudo iniciar el checkout en este momento. Inténtalo de nuevo o contacta al soporte.',
    internal: 'Error interno. Inténtalo de nuevo.',
  },
} as const

export async function POST(req: Request) {
  const lang = await getRequestLang()
  const tx = ERRORS[lang]
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: tx.missingAuth }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    // BUG CORRIGIDO (feature aprovada pelo usuário): planId/billingCycle são
    // opcionais — CheckoutModal os envia pra esta rota poder prever se a
    // troca vai cair no caminho nativo (updateSubscriptionPlan, sem coletar
    // cartão/endereço de novo) antes mesmo do usuário ver o formulário.
    // Corpo vazio (chamador antigo, ou assinatura nova sem plano ainda
    // selecionado) mantém o comportamento de sempre.
    let planId: string | undefined
    let billingCycle: 'monthly' | 'annual' | undefined
    try {
      const body = await req.json()
      planId = body?.planId
      billingCycle = body?.billingCycle === 'annual' ? 'annual' : 'monthly'
    } catch {
      // sem corpo — segue sem previsão de troca nativa
    }

    const supabase = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: tx.unauthorized }, { status: 401 })
    }

    // BUG CORRIGIDO (teste de estresse full-system, 2026-08-31): esta rota
    // não tinha rate limit, diferente de TODOS os irmãos da família checkout
    // — explorável de forma concreta: `country` é auto-editável pelo usuário
    // (allowlist de self-update de profiles), e setar `country='US'` faz o
    // branch Stripe criar um SetupIntent real na API deles a cada chamada,
    // sem teto.
    const permitido = await dentroDoLimiteFallback({
      bucket: `checkout_init_${user.id}`,
      limit: 10,
      logPrefix: 'checkout-init',
    })
    if (!permitido) {
      return NextResponse.json({ error: tx.tooManyAttempts }, { status: 429 })
    }

    const { data: profile } = await supabase.from('profiles').select('country').eq('id', user.id).single()
    const userCountry = profile?.country || undefined

    const settings = await getSettings(supabase)
    const nationalDefault = settings['gateway_nacional_padrao'] || 'mercadopago'
    const internationalDefault = settings['gateway_internacional_padrao'] || 'stripe'

    const gatewayName = selectGateway(userCountry, nationalDefault, internationalDefault)

    // --- Previsão de troca nativa de plano (sem coupon — ver comentário em
    // isNativePlanSwitchEligible: ignorar coupon aqui é seguro nas duas
    // direções, só pode fazer a previsão ser conservadora demais, nunca
    // prometer um "pula o formulário" que /api/checkout não vai honrar). ---
    let isNativePlanSwitch = false
    if (planId) {
      const { data: plan } = await supabase.from('plans').select('id, name, price, promotional_price').eq('id', planId).eq('is_active', true).single()
      const { data: existingActiveSub } = await supabase
        .from('subscriptions')
        .select('gateway, gateway_subscription_id, plan, price, billing_cycle')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (plan && existingActiveSub && (existingActiveSub.plan !== plan.name || existingActiveSub.billing_cycle !== billingCycle)) {
        let finalPrice = plan.promotional_price !== null && plan.promotional_price !== undefined ? Number(plan.promotional_price) : Number(plan.price)
        if (billingCycle === 'annual') finalPrice = (finalPrice * 0.8) * 12

        isNativePlanSwitch = isNativePlanSwitchEligible({
          existingSubGateway: existingActiveSub.gateway,
          existingSubGatewayId: existingActiveSub.gateway_subscription_id,
          existingSubPrice: existingActiveSub.price,
          targetGatewayName: gatewayName,
          finalPrice,
        })
      }
    }

    let publicKey = ''
    let clientSecret = ''

    // Troca nativa não precisa de cartão novo (updateSubscriptionPlan opera
    // na assinatura já existente no gateway) — pula o SetupIntent/chave
    // pública por completo. Evita uma chamada à Stripe à toa e, mais
    // importante, evita bloquear uma troca elegível por um erro transitório
    // de configuração de cartão que nem seria usado.
    if (!isNativePlanSwitch && gatewayName === 'stripe') {
      const secretKey = settings['stripe_secret_key']
      // BUG CORRIGIDO: a página de admin (app/(admin)/admin/configuracoes)
      // salva a chave publicável em 'stripe_pub_key' — era essa a linha
      // que já existia preenchida em produção. Esta rota lia
      // 'stripe_public_key', um nome diferente, sempre undefined. Resultado:
      // secretKey vinha certo mas publicKey ficava sempre vazio, e a
      // condição abaixo devolvia 503 em toda tentativa de checkout via
      // Stripe — mesmo com as duas chaves corretamente configuradas no
      // admin. Mercado Pago (mp_public_key) e Pagar.me (pagarme_pub_key) não
      // tinham essa divergência entre o nome salvo e o nome lido.
      publicKey = settings['stripe_pub_key'] || ''
      if (!secretKey || !publicKey) {
        return NextResponse.json({ error: tx.stripeNotConfigured }, { status: 503 })
      }
      
      // Create SetupIntent for Stripe Elements
      const siParams = new URLSearchParams()
      siParams.append('usage', 'off_session')
      
      const siRes = await fetch('https://api.stripe.com/v1/setup_intents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: siParams.toString()
      })

      if (!siRes.ok) {
        // BUG CORRIGIDO (validação do zero, rodada 6): o corpo cru da
        // resposta de erro da Stripe (pode incluir request_log_url e detalhe
        // interno) ia direto pro client via err.message no catch externo —
        // pior ainda, `country` (que decide se cai neste branch Stripe) é
        // editável pelo próprio usuário no perfil, então não precisa nem
        // forjar requisição pra alcançar esse caminho. Loga o detalhe
        // completo só no servidor; devolve mensagem genérica.
        console.error('[Checkout Init] Stripe setup_intents falhou:', await siRes.text())
        return NextResponse.json({ error: tx.stripeInitFailed }, { status: 502 })
      }
      const setupIntent = await siRes.json()
      clientSecret = setupIntent.client_secret
    } else if (!isNativePlanSwitch && gatewayName === 'mercadopago') {
      publicKey = settings['mp_public_key'] || ''
      if (!publicKey) {
        return NextResponse.json({ error: tx.mpNotConfigured }, { status: 503 })
      }
    }

    return NextResponse.json({
      gateway: gatewayName,
      publicKey,
      clientSecret,
      isNativePlanSwitch,
    })
  } catch (err: any) {
    // BUG CORRIGIDO (validação do zero, rodada 6): err.message cru (pode
    // conter detalhe interno de gateway/banco) ia direto pro cliente aqui —
    // mesma classe de vazamento já corrigida no ponto específico da Stripe
    // acima, endurecida aqui também como rede de segurança final.
    console.error('[Checkout Init] Error:', err)
    return NextResponse.json({ error: tx.internal }, { status: 500 })
  }
}
