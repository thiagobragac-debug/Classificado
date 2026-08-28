import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { resolverIpConfiavel } from '@/lib/ip-utils'
import {
  selectGateway,
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayAdapter,
  GatewayPlan,
  GatewayUser,
} from '@/lib/gateways'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6): toda mensagem de erro desta
// rota (cupom, "já tem este plano", gateway não configurado, falha de
// pagamento, etc.) voltava em português regardless do idioma ativo — e
// CheckoutModal.tsx sempre prefere data.error à sua própria tradução local,
// então o usuário via erro em português no momento mais crítico do checkout.
const ERRORS = {
  pt: {
    checkoutIdRequired: 'checkoutId é obrigatório',
    cardDataNotAccepted: 'Dados de cartão não são aceitos neste endpoint. Use o formulário do gateway, que devolve um token.',
    missingAuth: 'Cabeçalho de autorização ausente.',
    unauthorized: 'Não autorizado.',
    tooManyAttempts: 'Muitas tentativas. Aguarde um momento.',
    planIdRequired: 'planId é obrigatório',
    planNotFound: 'Plano não encontrado ou inativo',
    alreadyHasPlan: 'Você já tem este plano ativo.',
    stripeNotConfigured: 'Stripe não configurado. Contate o suporte.',
    mpNotConfigured: 'Mercado Pago não configurado. Contate o suporte.',
    pagarmeNotConfigured: 'Pagar.me não configurado. Contate o suporte.',
    asaasNotConfigured: 'Asaas não configurado. Contate o suporte.',
    invalidGateway: 'Gateway inválido.',
    couponInvalid: 'Cupom inválido, expirado ou com limite de usos esgotado.',
    processingInProgress: 'Processamento em andamento. Aguarde alguns segundos.',
    couponLimitReachedRace: 'O limite de uso deste cupom acabou de ser atingido por outro usuário.',
    planSwitchFailed: 'Não foi possível trocar de plano no momento. Tente novamente ou contate o suporte.',
    cannotVerifyCurrentSub: 'Não foi possível verificar sua assinatura atual. Contate o suporte antes de trocar de plano.',
    couponApplyError: 'Erro ao aplicar cupom (limite atingido ou falha interna).',
    paymentProcessingFailed: 'Não foi possível processar o pagamento no momento. Verifique os dados do cartão ou tente novamente.',
    internal: 'Erro interno. Tente novamente.',
  },
  es: {
    checkoutIdRequired: 'checkoutId es obligatorio',
    cardDataNotAccepted: 'No se aceptan datos de tarjeta en este endpoint. Usa el formulario del gateway, que devuelve un token.',
    missingAuth: 'Falta el encabezado de autorización.',
    unauthorized: 'No autorizado.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento.',
    planIdRequired: 'planId es obligatorio',
    planNotFound: 'Plan no encontrado o inactivo',
    alreadyHasPlan: 'Ya tienes este plan activo.',
    stripeNotConfigured: 'Stripe no está configurado. Contacta al soporte.',
    mpNotConfigured: 'Mercado Pago no está configurado. Contacta al soporte.',
    pagarmeNotConfigured: 'Pagar.me no está configurado. Contacta al soporte.',
    asaasNotConfigured: 'Asaas no está configurado. Contacta al soporte.',
    invalidGateway: 'Gateway inválido.',
    couponInvalid: 'Cupón inválido, vencido o con límite de usos agotado.',
    processingInProgress: 'Procesamiento en curso. Espera unos segundos.',
    couponLimitReachedRace: 'El límite de uso de este cupón acaba de ser alcanzado por otro usuario.',
    planSwitchFailed: 'No se pudo cambiar de plan en este momento. Inténtalo de nuevo o contacta al soporte.',
    cannotVerifyCurrentSub: 'No se pudo verificar tu suscripción actual. Contacta al soporte antes de cambiar de plan.',
    couponApplyError: 'Error al aplicar el cupón (límite alcanzado o fallo interno).',
    paymentProcessingFailed: 'No se pudo procesar el pago en este momento. Verifica los datos de la tarjeta o inténtalo de nuevo.',
    internal: 'Error interno. Inténtalo de nuevo.',
  },
} as const

export async function POST(req: Request) {
  const lang = await getRequestLang()
  const tx = ERRORS[lang]
  try {
    const body = await req.json()
    const { checkoutId, planId, billingCycle, billingData, paymentMethod, creditCard, billingAddress, gatewayToken, couponCode } = body

    if (!checkoutId) {
      return NextResponse.json({ error: tx.checkoutIdRequired }, { status: 400 })
    }

    // Dados de cartão em claro não entram mais aqui. O CheckoutModal deixou de
    // coletá-los; esta guarda cobre cliente em cache, integração de terceiro ou
    // requisição forjada. Receber PAN/CVV colocaria a aplicação no escopo
    // PCI-DSS SAQ-D — cartão só entra tokenizado, via `gatewayToken`.
    if (creditCard) {
      console.warn('[checkout] payload com creditCard recusado — cartao deve vir tokenizado')
      return NextResponse.json(
        { error: tx.cardDataNotAccepted },
        { status: 400 }
      )
    }

    // --- Auth ---
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

    // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): /api/* fica
    // de fora do rate limit de proxy.ts (só cobre /login e /auth) — esta
    // rota nunca teve nenhum freio de taxa, diferente de /api/contact-seller
    // (Upstash). Reaproveita check_rate_limit, o mesmo RPC com janela no
    // Postgres que /login já usa como rede de segurança sem Upstash.
    const { data: dentroDoLimite } = await supabase.rpc('check_rate_limit', {
      p_bucket: `checkout_${user.id}`,
      p_limit: 10,
      p_window_seconds: 60,
    })
    if (dentroDoLimite === false) {
      return NextResponse.json({ error: tx.tooManyAttempts }, { status: 429 })
    }

    // --- Validate inputs ---
    if (!planId) {
      return NextResponse.json({ error: tx.planIdRequired }, { status: 400 })
    }

    // --- Fetch plan (real table name: 'plans') ---
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, price, promotional_price')
      .eq('id', planId)
      .eq('is_active', true)
      .single()
    if (planError || !plan) {
      return NextResponse.json({ error: tx.planNotFound }, { status: 404 })
    }

    // --- Fetch user profile (real columns: 'name', 'country' — no full_name) ---
    const { data: profile } = await supabase
      .from('profiles')
      .select('country, name, display_name')
      .eq('id', user.id)
      .single()
    const userCountry: string | undefined = profile?.country || undefined

    // --- Fetch ALL platform settings (key-value table) ---
    const settings = await getSettings(supabase)

    const nationalDefault = settings['gateway_nacional_padrao'] || 'mercadopago'
    const internationalDefault = settings['gateway_internacional_padrao'] || 'stripe'

    // --- Select gateway based on country rule ---
    // Brasil → qualquer gateway configurado
    // Internacional → apenas Stripe ou Mercado Pago
    const gatewayName = selectGateway(userCountry, nationalDefault, internationalDefault)

    // --- Existing active subscription (read-only — a mutação real só
    // acontece depois do lock de idempotência, mais abaixo) ---
    const { data: existingActiveSub } = await supabase
      .from('subscriptions')
      .select('id, gateway, gateway_subscription_id, plan, price, billing_cycle, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // BUG CORRIGIDO (validação de 2026-08-26): só comparava plan.name —
    // trocar SÓ o ciclo de cobrança (mensal↔anual) no mesmo plano tinha
    // isPlanSwitch=false, pulava os dois blocos de troca/cancelamento
    // abaixo e caía direto no fluxo de "assinatura nova", deixando a
    // mensal antiga ativa em paralelo (risco real de cobrança dupla,
    // alcançável só via chamada direta à API, não pela UI normal — que já
    // desabilita o botão do plano atual independente do ciclo).
    const cycleForCompare: 'monthly' | 'annual' = billingCycle === 'annual' ? 'annual' : 'monthly'
    const isPlanSwitch = !!(existingActiveSub && (existingActiveSub.plan !== plan.name || existingActiveSub.billing_cycle !== cycleForCompare))

    // BUG CORRIGIDO (validação do zero, 4ª rodada): quando o plano+ciclo
    // pedido já é EXATAMENTE o que está ativo (isPlanSwitch=false com
    // existingActiveSub existente — ex.: reabrir o checkout, F5, clique
    // duplo), o código pulava os dois blocos de proteção (troca nativa e
    // cancelar-e-recriar) e caía direto em adapter.createSubscription sem
    // checagem nenhuma. Confirmado ao vivo: cobrança real duplicada, 2ª
    // assinatura Stripe ativa em paralelo à primeira.
    if (existingActiveSub && !isPlanSwitch) {
      return NextResponse.json({ error: tx.alreadyHasPlan }, { status: 409 })
    }

    // --- Build adapter with keys from DB ---
    let adapter: GatewayAdapter
    switch (gatewayName) {
      case 'stripe':
        if (!settings['stripe_secret_key']) {
          return NextResponse.json({ error: tx.stripeNotConfigured }, { status: 503 })
        }
        adapter = stripeAdapter(settings['stripe_secret_key'])
        break
      case 'mercadopago':
        if (!settings['mp_access_token']) {
          return NextResponse.json({ error: tx.mpNotConfigured }, { status: 503 })
        }
        adapter = mercadoPagoAdapter(settings['mp_access_token'])
        break
      case 'pagarme':
        if (!settings['pagarme_api_key']) {
          return NextResponse.json({ error: tx.pagarmeNotConfigured }, { status: 503 })
        }
        adapter = pagarmeAdapter(settings['pagarme_api_key'])
        break
      case 'asaas':
        if (!settings['asaas_api_key']) {
          return NextResponse.json({ error: tx.asaasNotConfigured }, { status: 503 })
        }
        adapter = asaasAdapter(
          settings['asaas_api_key'],
          (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'
        )
        break
      default:
        return NextResponse.json({ error: tx.invalidGateway }, { status: 500 })
    }

    // --- Build plan & user objects for adapter ---
    let basePrice =
      plan.promotional_price !== null && plan.promotional_price !== undefined
        ? Number(plan.promotional_price)
        : Number(plan.price)

    const cycle: 'monthly' | 'annual' = billingCycle === 'annual' ? 'annual' : 'monthly'

    if (cycle === 'annual') {
      basePrice = (basePrice * 0.8) * 12
    }

    let finalPrice = basePrice

    // Apply Coupon Logic (read-only lookup — o RPC que efetivamente
    // consome o uso do cupom só roda depois do lock de idempotência)
    let appliedCoupon: any = null
    if (couponCode) {
      const { data: couponData } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', String(couponCode).toUpperCase())
        .eq('is_active', true)
        .single()

      const valido = !!couponData &&
        (!couponData.valid_until || new Date(couponData.valid_until) >= new Date()) &&
        (!couponData.max_uses || couponData.usage_count < couponData.max_uses)

      // BUG CORRIGIDO: quando o cupom deixava de ser válido bem entre o
      // usuário aplicá-lo (checagem client-side em CheckoutModal) e o envio
      // do pagamento — ex.: outra pessoa esgotou o último uso nesse
      // intervalo —, esta rota simplesmente ignorava o cupom em silêncio e
      // cobrava o preço cheio, sem avisar. O usuário via "cupom aplicado"
      // na tela e era cobrado o valor sem desconto, sem nenhum erro.
      if (!valido) {
        return NextResponse.json({ error: tx.couponInvalid }, { status: 400 })
      }

      if (couponData.discount_type === 'percentage') {
        finalPrice = finalPrice * (1 - couponData.discount_value / 100)
      } else {
        finalPrice = Math.max(0, finalPrice - couponData.discount_value)
      }
      appliedCoupon = couponData
    }

    const gatewayPlan: GatewayPlan = {
      id: String(plan.id),
      name: plan.name,           // real column: 'name' (no name_pt)
      price: finalPrice,         // EXACT amount to be charged for the period
      billingCycle: cycle,
    }

    const gatewayUser: GatewayUser = {
      id: user.id,
      email: user.email!,
      // real column: 'name' (no full_name). billingData.name takes priority if provided
      name: billingData?.name || profile?.display_name || profile?.name || user.email,
      country: userCountry,
    }

    // --- Idempotency: prevent double checkout (e.g., double-click or page refresh) ---
    // Strict 15 seconds block for the EXACT SAME PLAN AND CYCLE to prevent double charges on gateway
    const fifteenSecsAgo = new Date(Date.now() - 15 * 1000).toISOString()
    const { data: existingRecent } = await supabase
      .from('subscriptions')
      .select('id, gateway_subscription_id, status, created_at')
      .eq('user_id', user.id)
      .eq('plan', plan.name)
      .eq('billing_cycle', cycle)
      .gte('created_at', fifteenSecsAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRecent) {
      return NextResponse.json({ error: tx.processingInProgress }, { status: 429 })
    }

    // --- IMMEDIATE LOCK: Insert phantom subscription to block concurrent/retried clicks ---
    // BUG CORRIGIDO (validação do zero, 3ª rodada): este lock (id=checkoutId,
    // PRIMARY KEY) era inserido só depois de ~250 linhas de lógica de
    // negócio — incluindo a troca nativa de plano na Stripe e o
    // cancelamento real da assinatura anterior, ambos COM efeito colateral
    // real no gateway. Reenviar o mesmo checkoutId (retry de rede, duplo
    // clique antes do botão desabilitar, etc.) executava esse cancelamento/
    // troca de novo antes de finalmente esbarrar no 23505 do INSERT. Agora
    // o lock é adquirido ANTES de qualquer ação que mexa no gateway — uma
    // 2ª chamada com o mesmo checkoutId é barrada aqui, sem chegar perto de
    // cancelar ou trocar nada.
    const { data: phantomSub, error: insertError } = await supabase.from('subscriptions').insert({
      id: checkoutId,
      user_id: user.id,
      plan: plan.name,
      gateway: gatewayName,
      billing_cycle: cycle,
      status: 'pending',
      current_period_start: new Date().toISOString(),
      price: finalPrice,
    }).select('id').single()

    if (insertError) {
      console.error('[Checkout] Failed to create lock record (Double-Charge Blocked):', insertError.message)
      return NextResponse.json({ error: tx.processingInProgress }, { status: 429 })
    }

    // --- Troca de plano com assinatura já existente ---
    //
    // Quando dá pra trocar a MESMA assinatura na Stripe (gateway atual e
    // antigo são os dois Stripe), usa o suporte nativo de proration dela —
    // é o único gateway com essa API pronta. Upgrade cobra a diferença
    // proporcional agora (proration_behavior=always_invoice), downgrade só
    // aplica o preço novo na próxima fatura, sem cobrar nem creditar nada
    // agora (proration_behavior=none) — o `prorate` abaixo é essa decisão,
    // baseada em qual preço é maior.
    //
    // Pros demais gateways (sem essa API) ou troca entre gateways
    // diferentes, cai no caminho antigo: cancela a assinatura anterior e
    // cria uma nova.
    //
    // BUG CORRIGIDO (validação do zero, 4ª rodada): um cupom de 100% off
    // aplicado numa troca nativa entrava aqui com finalPrice=0 e
    // proration_behavior=always_invoice (upgrade) gravava unit_amount=0
    // como preço RECORRENTE PERMANENTE da assinatura na Stripe — sem
    // nenhum mecanismo de restaurar o preço depois. Confirmado ao vivo.
    // Excluir finalPrice<=0 daqui empurra pro caminho de baixo (cancela a
    // assinatura antiga de verdade + bypass local), que é o mesmo
    // tratamento que uma assinatura nova com cupom 100% já recebe.
    const prorate = finalPrice > Number(existingActiveSub?.price ?? 0)
    // BUG CORRIGIDO (validação do zero, rodada 6): Mercado Pago, Pagar.me e
    // Asaas ganharam updateSubscriptionPlan nesta rodada, mas nenhum deles
    // tem conceito de proração (não dá pra cobrar a diferença de upgrade na
    // hora como a Stripe faz) — por isso só entram aqui em DOWNGRADE
    // (!prorate). Upgrade nessas 3 gateways continua no fallback de
    // cancelar+recriar abaixo, que já cobra o preço cheio na hora (mesmo
    // comportamento de sempre, não piorou nem melhorou nesta rodada).
    const gatewaySuportaTrocaNativa = gatewayName === 'stripe' || (!prorate && (gatewayName === 'mercadopago' || gatewayName === 'pagarme' || gatewayName === 'asaas'))
    if (isPlanSwitch && finalPrice > 0 && existingActiveSub!.gateway_subscription_id && existingActiveSub!.gateway === gatewayName && gatewaySuportaTrocaNativa && adapter.updateSubscriptionPlan) {
      try {
        if (appliedCoupon) {
          const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
          if (rpcErr || success === false) {
            await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
            return NextResponse.json({ error: tx.couponLimitReachedRace }, { status: 400 })
          }
        }

        // BUG CORRIGIDO (validação de 2026-08-26): checkoutId (UUID que o
        // CheckoutModal gera por abertura do modal) como nonce de
        // idempotência — ver comentário em lib/gateways/types.ts.
        const switchResult = await adapter.updateSubscriptionPlan(existingActiveSub!.gateway_subscription_id!, gatewayPlan, prorate, checkoutId)

        // BUG CORRIGIDO (validação do zero, rodada 6): condiciona o UPDATE ao
        // status ainda ser 'active' no momento da escrita — fecha a mesma
        // janela TOCTOU já corrigida em /api/subscriptions/cancel (um cancel
        // concorrente rodando entre a leitura de existingActiveSub no topo
        // desta requisição e este ponto). A chamada ao gateway já aconteceu
        // (não dá pra desfazer de forma simples), então zero linhas afetadas
        // aqui só vira um log — precisa de revisão manual, não bloqueia a
        // resposta de sucesso pro usuário.
        const { data: switchUpdateResult } = await supabase.from('subscriptions').update({
          plan: plan.name,
          price: finalPrice,
          billing_cycle: cycle,
          // BUG CORRIGIDO (validação do zero, 3ª rodada): current_period_end
          // nunca era atualizado aqui — ficava com o valor da assinatura
          // anterior à troca, o que é especialmente errado numa troca de
          // CICLO (mensal↔anual), que a Stripe realinha de verdade.
          ...(switchResult.currentPeriodEnd ? { current_period_end: switchResult.currentPeriodEnd } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', existingActiveSub!.id).eq('status', 'active').select('id')

        // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): a
        // guarda abaixo detectava a corrida (0 linhas afetadas — outra
        // operação, ex. um cancelamento concorrente, já mudou o status dessa
        // assinatura) mas o bloco de sincronização de downgrade rodava
        // incondicionalmente mesmo assim, sobrescrevendo profiles/
        // user_secrets por cima do que a outra operação acabou de gravar.
        // Detectar a corrida sem impedir a escrita seguinte não protegia
        // nada — reproduzido em cenário de downgrade concorrente com
        // cancelamento. Guarda agora bloqueia o bloco de entitlement inteiro.
        const trocaAplicadaComSeguranca = !!switchUpdateResult && switchUpdateResult.length > 0
        if (!trocaAplicadaComSeguranca) {
          console.error(`[Checkout] Troca de plano aplicada na Stripe, mas a assinatura local ${existingActiveSub!.id} não estava mais 'active' no momento da escrita — revisão manual necessária, entitlement NÃO sincronizado.`)
        }

        // BUG CORRIGIDO (validação do zero, rodada 6): downgrade (prorate=
        // false) deixava o entitlement (user_secrets.plan/plan_id,
        // profiles.plan_expires_at) preso esperando a PRÓXIMA renovação
        // natural pra sincronizar — até um ciclo de cobrança inteiro com o
        // cliente pagando o plano barato mas mantendo os benefícios do caro.
        // Isso nunca pode ser "explorado a favor do cliente" (é uma REDUÇÃO
        // de acesso), diferente de upgrade — que precisa mesmo esperar a
        // fatura de proração ser confirmada paga antes de conceder mais
        // acesso. Só downgrade sincroniza aqui, na hora — e só quando a
        // guarda acima confirmar que esta requisição realmente aplicou a
        // troca na linha que ainda estava 'active'.
        if (!prorate && trocaAplicadaComSeguranca) {
          let downgradePlanEnum = 'free'
          if (plan.name.toLowerCase().includes('premium')) downgradePlanEnum = 'premium'
          else if (plan.name.toLowerCase().includes('pro')) downgradePlanEnum = 'pro'

          await supabase.from('profiles').update({
            subscription_status: 'active',
            plan_expires_at: switchResult.currentPeriodEnd || existingActiveSub!.current_period_end || null,
          }).eq('id', user.id)

          const { error: downgradeSecErr } = await supabase.from('user_secrets').update({
            plan: downgradePlanEnum,
            plan_id: plan.id,
          }).eq('id', user.id)
          if (downgradeSecErr) console.warn('[Checkout] Falha ao sincronizar user_secrets no downgrade imediato (não crítico):', downgradeSecErr.message)
        }

        // BUG CORRIGIDO (validação do zero, 3ª rodada): user_secrets.plan/
        // plan_id e profiles.subscription_status NÃO são mais sincronizados
        // aqui, na hora. Dois problemas do design anterior:
        //   1) Upgrade (prorate=true): a chamada de update só confirma que
        //      o PREÇO mudou na Stripe — a fatura de proração
        //      (proration_behavior=always_invoice) é cobrada de forma
        //      assíncrona e pode falhar depois (cartão recusado). O usuário
        //      ganhava o plano novo mesmo se essa cobrança falhasse, sem
        //      nenhuma reconciliação (o safety-net de payment.failed só
        //      revoga se o período já tiver vencido, o que nunca é o caso
        //      no meio do ciclo). Agora só o webhook
        //      'subscription.plan_changed' (invoice.payment_succeeded com
        //      billing_reason=subscription_update) concede o entitlement —
        //      só depois da cobrança confirmada.
        //   2) Downgrade (prorate=false): o preço só muda na PRÓXIMA
        //      fatura (promessa do FAQ), mas o entitlement (cota de
        //      anúncios, vídeo, banner, destaques) mudava JÁ — cliente
        //      perdia benefício que ainda estava pagando no ciclo atual.
        //      Como subscriptions.plan já foi atualizado acima, o entitlement
        //      novo é aplicado sozinho quando a renovação natural chegar
        //      (webhook 'subscription.renewed' já lê sub.plan em produção).
        //
        // BUG CORRIGIDO (validação do zero, 4ª rodada — CRÍTICO): este
        // bloco fazia DELETE do lock aqui, reabrindo a PK checkoutId pra um
        // INSERT futuro. Um retry genuíno com o MESMO checkoutId depois do
        // sucesso (ex.: resposta perdida por timeout, exatamente o cenário
        // que motivou o design deste lock) passava pelo INSERT sem
        // conflito, achava existingActiveSub.plan já igual ao alvo
        // (isPlanSwitch=false) e caía em createSubscription — que SEMPRE
        // cria Customer+Subscription novos e cobra na hora. Confirmado ao
        // vivo, 3x de forma independente: segunda assinatura Stripe real
        // criada e cobrada, assinatura original ficando ativa em paralelo.
        // Marcar como status terminal (em vez de apagar) mantém a PK
        // ocupada pra sempre — um retry com o mesmo checkoutId esbarra de
        // novo no 23505, como deveria.
        await supabase.from('subscriptions').update({
          status: 'switch_applied',
          updated_at: new Date().toISOString(),
        }).eq('id', phantomSub.id)

        return NextResponse.json({
          success: true,
          checkoutUrl: null,
          gateway: gatewayName,
          sessionId: null,
          planSwitch: true,
          prorated: prorate,
        })
      } catch (switchErr: any) {
        if (appliedCoupon) {
          await supabase.rpc('revert_coupon_usage', { p_coupon_id: appliedCoupon.id })
        }
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
        // BUG CORRIGIDO (validação de 2026-08-26): switchErr.message tinha
        // o corpo cru da resposta de erro da Stripe concatenado direto no
        // JSON devolvido ao cliente — incluía request_log_url (link do
        // dashboard interno da Stripe) e o account ID do merchant. Loga o
        // detalhe completo só no servidor; devolve mensagem genérica.
        console.error('[Checkout] Failed to switch plan on existing subscription:', switchErr.message)
        return NextResponse.json({ error: tx.planSwitchFailed }, { status: 502 })
      }
    }

    // Fallback (gateways sem update nativo, troca entre gateways
    // diferentes, ou assinatura anterior sem gateway_subscription_id —
    // ex.: ativada via cupom de 100% off): garante que a assinatura
    // anterior nunca fica ativa em paralelo à nova.
    //
    // BUG CORRIGIDO (validação do zero, rodada 6): este bloco cancelava a
    // assinatura ANTERIOR aqui, ANTES de sequer tentar criar a nova — se
    // adapter.createSubscription falhasse mais abaixo (cartão recusado, erro
    // do gateway), o catch daquele bloco só apagava o lock e revertia o
    // cupom, sem NENHUMA compensação pra assinatura antiga já cancelada de
    // verdade no gateway. Resultado: cliente ficava sem plano nenhum
    // (assinatura antiga cancelada, nova nunca criada), enquanto profiles/
    // user_secrets continuavam mostrando o plano antigo como ativo —
    // entitlement órfão, reproduzido ao vivo.
    //
    // Correção: só VALIDA aqui que dá pra cancelar a antiga (monta o adapter,
    // bloqueia cedo se o gateway dela não estiver configurado) — a chamada
    // de cancelamento em si só acontece DEPOIS que a assinatura NOVA for
    // criada com sucesso (ver finalizarCancelamentoAntigo, chamada nos dois
    // pontos de sucesso mais abaixo: bypass de 100% off e criação paga). Se
    // o cancelamento da antiga falhar NAQUELE momento, a nova já existe e
    // está paga — o pior caso vira "assinatura antiga esquecida, precisa de
    // limpeza manual" em vez de "cliente sem plano nenhum".
    let oldAdapterParaTrocaFallback: GatewayAdapter | null = null
    if (isPlanSwitch && existingActiveSub!.gateway_subscription_id) {
      switch (existingActiveSub!.gateway) {
        case 'stripe': if (settings['stripe_secret_key']) oldAdapterParaTrocaFallback = stripeAdapter(settings['stripe_secret_key']); break
        case 'mercadopago': if (settings['mp_access_token']) oldAdapterParaTrocaFallback = mercadoPagoAdapter(settings['mp_access_token']); break
        case 'pagarme': if (settings['pagarme_api_key']) oldAdapterParaTrocaFallback = pagarmeAdapter(settings['pagarme_api_key']); break
        case 'asaas': if (settings['asaas_api_key']) oldAdapterParaTrocaFallback = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'); break
      }
      if (!oldAdapterParaTrocaFallback) {
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
        return NextResponse.json({ error: tx.cannotVerifyCurrentSub }, { status: 503 })
      }
    }

    // Chamada ao gateway (ou local) da assinatura NOVA já teve sucesso quando
    // isto é chamado — cancela a antiga só agora. Nunca lança: uma falha aqui
    // é logada pra revisão manual, mas não desfaz a assinatura nova (que já
    // está paga/ativa).
    const finalizarCancelamentoAntigo = async () => {
      if (!isPlanSwitch) return
      try {
        if (oldAdapterParaTrocaFallback) {
          await oldAdapterParaTrocaFallback.cancelSubscription(existingActiveSub!.gateway_subscription_id!)
        }
        const { data: cancelOldResult } = await supabase.from('subscriptions').update({
          status: 'cancelled',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }).eq('id', existingActiveSub!.id).eq('status', 'active').select('id')
        if (!cancelOldResult || cancelOldResult.length === 0) {
          console.error(`[Checkout] Assinatura nova criada, mas a antiga ${existingActiveSub!.id} não estava mais 'active' na hora de cancelar — revisão manual necessária.`)
        }
      } catch (cancelErr: any) {
        console.error('[Checkout] Assinatura nova criada com sucesso, mas falha ao cancelar a antiga no gateway (revisão manual necessária):', cancelErr.message)
      }
    }

    const paymentData = {
      method: paymentMethod || 'card',
      creditCard,
      billingAddress,
      gatewayToken,
      doc: billingData?.doc,
      phone: billingData?.phone,
      // A Asaas marca `remoteIp` como obrigatório na criação de assinatura por
      // cartão (achado de auditoria contra a doc oficial). Os demais gateways
      // ignoram este campo.
      ip: resolverIpConfiavel(req.headers),
    }

    // --- 100% OFF Bypass (Local Checkout) ---
    // Este é o ÚNICO caminho sem nenhuma chamada de gateway — não há
    // pagamento a reconciliar, então sincronizar o entitlement na hora é
    // correto (não é o mesmo risco do bug de proração corrigido acima).
    if (finalPrice <= 0) {
      if (appliedCoupon) {
        const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
        if (rpcErr || success === false) {
           await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
           return NextResponse.json({ error: tx.couponApplyError }, { status: 400 })
        }
      }

      const end = new Date()
      if (cycle === 'annual') end.setFullYear(end.getFullYear() + 1)
      else end.setMonth(end.getMonth() + 1)

      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): as
      // 3 escritas abaixo (subscriptions/profiles/user_secrets) não checavam
      // erro nenhum antes de finalizarCancelamentoAntigo() rodar — nesse
      // caminho (bypass de 100% off) não existe gateway nenhum confirmando a
      // nova assinatura, a ÚNICA "prova" de que ela existe é o UPDATE de
      // subscriptions abaixo ter realmente afetado a linha. Se ele falhar
      // (erro do Postgres, linha apagada concorrentemente) em silêncio — o
      // postgrest-js nunca lança exceção por isso, só devolve {error} — a
      // função de cancelamento rodava do mesmo jeito e cancelava a
      // assinatura antiga de verdade, reproduzindo a exata falha ("cliente
      // sem plano nenhum") que a correção original desta rodada queria
      // eliminar, só que via erro de escrita local em vez de falha do
      // gateway.
      const { data: novaAtivadaResult, error: novaAtivadaErr } = await supabase.from('subscriptions').update({
        status: 'active',
        current_period_end: end.toISOString()
      }).eq('id', phantomSub.id).select('id')

      if (novaAtivadaErr || !novaAtivadaResult || novaAtivadaResult.length === 0) {
        console.error('[Checkout] Falha ao confirmar a nova assinatura (bypass 100% off) — assinatura antiga NÃO será cancelada:', novaAtivadaErr?.message || 'nenhuma linha afetada')
        if (appliedCoupon) {
          await supabase.rpc('revert_coupon_usage', { p_coupon_id: appliedCoupon.id })
        }
        return NextResponse.json({ error: tx.internal }, { status: 500 })
      }

      await supabase.from('profiles').update({
        subscription_status: 'active',
        plan_expires_at: end.toISOString()
      }).eq('id', user.id)

      let planEnum = 'free'
      if (plan.name.toLowerCase().includes('premium')) planEnum = 'premium'
      else if (plan.name.toLowerCase().includes('pro')) planEnum = 'pro'

      await supabase.from('user_secrets').update({
        plan: planEnum,
        plan_id: plan.id
      }).eq('id', user.id)

      await finalizarCancelamentoAntigo()

      return NextResponse.json({
        success: true,
        checkoutUrl: null,
        gateway: 'local',
        sessionId: null,
      })
    }

    // --- Atomic Coupon Lock Before Gateway ---
    if (appliedCoupon) {
      const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
      if (rpcErr || success === false) {
        // Rollback lock
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
        return NextResponse.json({ error: tx.couponLimitReachedRace }, { status: 400 })
      }
    }

    // --- Call gateway ---
    let result
    try {
      result = await adapter.createSubscription(gatewayPlan, gatewayUser, paymentData, phantomSub.id)
    } catch (gatewayError: any) {
      // If gateway fails, remove the lock and revert coupon so user can try again immediately
      await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
      if (appliedCoupon) {
        await supabase.rpc('revert_coupon_usage', { p_coupon_id: appliedCoupon.id })
      }
      // BUG CORRIGIDO (validação do zero, 3ª rodada): antes este catch dava
      // `throw gatewayError`, que caía no catch externo lá embaixo e
      // devolvia gatewayError.message CRU pro cliente — mesma classe de
      // vazamento já corrigida no bloco de troca de plano, mas nunca
      // replicada aqui (o caminho de assinatura nova). Loga o detalhe
      // completo só no servidor; devolve mensagem genérica.
      console.error('[Checkout] Gateway error creating subscription:', gatewayError.message)
      return NextResponse.json({ error: tx.paymentProcessingFailed }, { status: 502 })
    }

    // --- Update pending subscription with real gateway details ---
    const { error: updateError } = await supabase.from('subscriptions').update({
      gateway_subscription_id: result.gatewaySubscriptionId || result.sessionId || null,
      gateway_customer_id: result.gatewayCustomerId || null,
    }).eq('id', phantomSub.id)

    if (updateError) {
      console.error('[Checkout] Failed to update subscription with gateway details:', updateError.message)
    }

    await finalizarCancelamentoAntigo()

    return NextResponse.json({
      success: true,
      checkoutUrl: result.checkoutUrl || null,
      gateway: gatewayName,
      sessionId: result.sessionId || null,
    })

  } catch (err: any) {
    // BUG CORRIGIDO (validação do zero, 3ª rodada): mesmo vazamento do
    // achado acima, na rede de segurança final — não repassa err.message
    // (pode conter detalhe interno de gateway/banco) pro cliente.
    console.error('[Checkout] Error:', err)
    return NextResponse.json({ error: tx.internal }, { status: 500 })
  }
}
