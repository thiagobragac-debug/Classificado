import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent } from './types'
import { assinaturaConfere, timestampRecente } from './signature'

export function stripeAdapter(secretKey: string): GatewayAdapter {
  return {
    name: 'stripe',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card' || !paymentData.gatewayToken) {
        throw new Error('Stripe integration here requires a valid payment method token.')
      }

      // 1. Get PaymentMethod ID (from Stripe Elements confirmSetup)
      const pmId = paymentData.gatewayToken

      // 2. Create Customer
      // Idempotency-Key em toda chamada de criação, não só na última do fluxo
      // (achado de auditoria contra a doc de idempotência da Stripe): sem ela,
      // uma conexão que cai entre a Stripe criar o Customer e a resposta
      // chegar aqui faria o app tentar de novo e falhar, porque o PaymentMethod
      // já ficou anexado ao Customer da tentativa anterior.
      const custIdempotencyKey = `stripe_cust_${subscriptionId}`

      const custParams = new URLSearchParams()
      if (user.email) custParams.append('email', user.email)
      custParams.append('name', user.name || 'User')
      custParams.append('payment_method', pmId)
      custParams.append('invoice_settings[default_payment_method]', pmId)

      const custRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': custIdempotencyKey,
        },
        body: custParams.toString()
      })
      if (!custRes.ok) {
        throw new Error(`Stripe erro ao criar cliente: ${await custRes.text()}`)
      }
      const customer = await custRes.json()

      // 3. Create a Product for this subscription's price_data.
      //
      // BUG CRÍTICO CORRIGIDO: o código enviava
      // items[0][price_data][product_data][name], mas price_data.product_data
      // não existe na API de Subscriptions — só em Checkout Sessions. O único
      // campo que a Subscriptions API aceita ali é price_data.product
      // (obrigatório), o ID de um Product já existente. Sem ele, TODO
      // POST /v1/subscriptions falhava por parâmetro obrigatório ausente —
      // nenhuma assinatura via Stripe conseguia ser criada.
      //
      // Um Product não pode ser pré-criado por plano porque o preço final
      // varia por checkout (cupom de desconto é aplicado em
      // app/api/checkout/route.ts antes de chegar aqui) — então criamos um
      // Product dedicado por assinatura, com o mesmo Idempotency-Key do
      // checkout para não duplicar em caso de retry.
      const prodParams = new URLSearchParams()
      prodParams.append('name', plan.name)
      const prodRes = await fetch('https://api.stripe.com/v1/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `stripe_prod_${subscriptionId}`,
        },
        body: prodParams.toString()
      })
      if (!prodRes.ok) {
        throw new Error(`Stripe erro ao criar produto: ${await prodRes.text()}`)
      }
      const product = await prodRes.json()

      // 4. Create Subscription
      const subParams = new URLSearchParams()
      subParams.append('customer', customer.id)
      subParams.append('items[0][price_data][currency]', 'brl')
      subParams.append('items[0][price_data][product]', product.id)
      subParams.append('items[0][price_data][recurring][interval]', plan.billingCycle === 'annual' ? 'year' : 'month')
      const priceInCents = Math.round(plan.price * 100)
      subParams.append('items[0][price_data][unit_amount]', priceInCents.toString())

      subParams.append('metadata[user_id]', user.id)
      subParams.append('metadata[plan_id]', plan.id)
      subParams.append('metadata[billing_cycle]', plan.billingCycle)
      subParams.append('metadata[subscription_id]', subscriptionId)

      // Idempotency Key: Uses the gateway token (or fallback to user+plan) to make it deterministic for double-clicks
      const idempotencyKey = `stripe_sub_${user.id}_${plan.id}_${paymentData.gatewayToken || 'fallback'}`

      const response = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': idempotencyKey
        },
        body: subParams.toString()
      })

      if (!response.ok) {
        throw new Error(`Stripe erro na assinatura: ${await response.text()}`)
      }

      const subscription = await response.json()

      return { checkoutUrl: '', sessionId: subscription.id, gatewaySubscriptionId: subscription.id, gatewayCustomerId: customer.id }
    },
    
    async updateSubscriptionPlan(gatewaySubscriptionId, plan, prorate, idempotencyNonce) {
      // 1. Busca a assinatura real pra achar o item a trocar (subscriptions
      // têm 1 item só neste app, mas a API sempre exige o id do item).
      const getRes = await fetch(`https://api.stripe.com/v1/subscriptions/${gatewaySubscriptionId}`, {
        headers: { 'Authorization': `Bearer ${secretKey}` }
      })
      if (!getRes.ok) {
        throw new Error(`Stripe erro ao buscar assinatura: ${await getRes.text()}`)
      }
      const existingSub = await getRes.json()
      const itemId = existingSub.items?.data?.[0]?.id
      if (!itemId) {
        throw new Error('Stripe: assinatura existente sem item — não é possível trocar o preço.')
      }

      // 2. Cria um Product novo pro plano novo (preço final varia por
      // cupom, mesma razão de createSubscription não reaproveitar Products).
      const prodParams = new URLSearchParams()
      prodParams.append('name', plan.name)
      const prodRes = await fetch('https://api.stripe.com/v1/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `stripe_prod_update_${idempotencyNonce}`,
        },
        body: prodParams.toString()
      })
      if (!prodRes.ok) {
        throw new Error(`Stripe erro ao criar produto: ${await prodRes.text()}`)
      }
      const product = await prodRes.json()

      // 3. Atualiza a assinatura existente com o preço novo no MESMO item —
      // troca de plano continua sendo 1 assinatura só na Stripe, não duas.
      // proration_behavior é o que decide upgrade (cobra agora) vs
      // downgrade (só na próxima fatura) — documentado na interface.
      const updateParams = new URLSearchParams()
      updateParams.append('items[0][id]', itemId)
      updateParams.append('items[0][price_data][currency]', 'brl')
      updateParams.append('items[0][price_data][product]', product.id)
      updateParams.append('items[0][price_data][recurring][interval]', plan.billingCycle === 'annual' ? 'year' : 'month')
      updateParams.append('items[0][price_data][unit_amount]', Math.round(plan.price * 100).toString())
      updateParams.append('proration_behavior', prorate ? 'always_invoice' : 'none')
      updateParams.append('metadata[plan_id]', plan.id)
      // BUG CORRIGIDO (validação de 2026-08-26, 3ª rodada): faltava sincronizar
      // metadata[billing_cycle] aqui — createSubscription já grava isso na
      // criação, mas trocar de ciclo (mensal↔anual) via update deixava o
      // metadata da Stripe com o valor da criação original.
      updateParams.append('metadata[billing_cycle]', plan.billingCycle)

      const updateRes = await fetch(`https://api.stripe.com/v1/subscriptions/${gatewaySubscriptionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `stripe_sub_update_${idempotencyNonce}`,
        },
        body: updateParams.toString()
      })
      if (!updateRes.ok) {
        throw new Error(`Stripe erro ao trocar plano da assinatura: ${await updateRes.text()}`)
      }
      const updated = await updateRes.json()
      // BUG CORRIGIDO (validação do zero, 4ª rodada): a "correção" da 3ª
      // rodada lia updated.current_period_end (nível raiz do objeto
      // Subscription) — mas nesta versão de API da Stripe (a mesma migração
      // "basil e além" que este arquivo já trata para invoice.subscription
      // em validateWebhook) esse campo não existe mais na raiz, só em
      // items.data[0].current_period_end. Confirmado ao vivo, 5x de forma
      // independente: o campo lido era sempre undefined, current_period_end
      // nunca sincronizava de verdade — a correção era um no-op silencioso.
      const currentPeriodEndRaw = updated.items?.data?.[0]?.current_period_end
      const currentPeriodEnd = currentPeriodEndRaw
        ? new Date(currentPeriodEndRaw * 1000).toISOString()
        : undefined
      return { gatewaySubscriptionId: updated.id, currentPeriodEnd }
    },

    async validateWebhook(body, headers, secret) {
      const sigHeader = headers['stripe-signature']
      if (!sigHeader) throw new Error('Missing Stripe signature')
      
      const parts = sigHeader.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=')
        if (key && value) acc[key.trim()] = value.trim()
        return acc
      }, {} as Record<string, string>)
      
      if (!secret) {
        throw new Error('Stripe webhook secret not configured. Rejecting webhook.')
      }
      
      // O timestamp faz parte do payload assinado, então não pode ser forjado
      // sem o secret — mas uma requisição legítima capturada continuaria válida
      // para sempre se ninguém checasse a idade dela.
      if (!timestampRecente(parts.t)) {
        throw new Error('Stripe webhook timestamp outside tolerance (replay)')
      }

      const payload = `${parts.t}.${body}`
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
      if (!assinaturaConfere(expectedSig, parts.v1)) {
        throw new Error('Invalid Stripe signature')
      }
      
      const event = JSON.parse(body)
      // Declare obj early — needed inside if/else branches (e.g., billing_reason check)
      const obj = event.data?.object || {}
      let type: WebhookEvent['type'] = 'unknown'

      // checkout.session.completed nunca é disparado por este código: em
      // lugar nenhum é criada uma Checkout Session (o fluxo é Setup Intent +
      // Subscription direto). Mantido por segurança caso um fluxo futuro
      // passe a usar Checkout, mas hoje é inalcançável.
      if (event.type === 'checkout.session.completed') {
        type = 'subscription.activated'
      } else if (event.type === 'invoice.payment_succeeded') {
        const billingReason = obj.billing_reason
        if (billingReason === 'subscription_create') {
          type = 'subscription.activated'
        } else if (billingReason === 'subscription_cycle') {
          type = 'subscription.renewed'
        } else if (billingReason === 'subscription_update') {
          // BUG CORRIGIDO (validação de 2026-08-26, 3ª rodada): a fatura de
          // proração de uma troca de plano nativa (upgrade,
          // proration_behavior=always_invoice) caía aqui como 'unknown' e
          // era ignorada — o checkout já aplicava o entitlement do plano
          // novo na hora, sem esperar essa fatura ser paga de verdade. Se o
          // pagamento da proração falhasse depois (cartão recusado), nada
          // revertia o acesso (o safety-net de payment.failed só age se o
          // período já tiver vencido, o que nunca é o caso no meio do
          // ciclo). Agora o checkout NÃO aplica mais o entitlement na hora
          // para troca nativa — só este evento (confirmação de pagamento
          // real da proração) libera o plano novo.
          type = 'subscription.plan_changed'
        } else {
          type = 'unknown'
        }
      } else if (event.type === 'customer.subscription.deleted') {
        type = 'subscription.cancelled'
      } else if (event.type === 'invoice.payment_failed') {
        type = 'payment.failed'
      } else if (event.type === 'invoice.payment_action_required') {
        // Fatura recorrente presa aguardando autenticação adicional do
        // portador do cartão (SCA/3D Secure) — reaproveita 'payment.failed'
        // porque é o tipo mais próximo que o schema atual de subscriptions
        // reconhece (marca status='past_due' em app/api/webhooks/payments/
        // route.ts). Isso evita que a assinatura fique 'active' indefinidamente
        // enquanto a Stripe espera uma autenticação que nunca chega. Avisar o
        // cliente por e-mail com o link de autenticação
        // (obj.hosted_invoice_url) é melhoria futura — exige infraestrutura de
        // e-mail que este código ainda não tem.
        type = 'payment.failed'
      }

      // BUG CRÍTICO CORRIGIDO: a partir da versão de API "basil" (2025-03-31)
      // da Stripe, o campo invoice.subscription foi descontinuado — o ID da
      // assinatura passou para invoice.parent.subscription_details.subscription
      // (só quando invoice.parent.type === 'subscription_details'). Como
      // nenhuma chamada aqui fixa Stripe-Version, a conta usa a versão padrão
      // (atual, pós-basil), então obj.subscription é sempre undefined para
      // eventos de invoice — o fallback para obj.id pegava o ID da FATURA
      // (in_xxx) em vez da ASSINATURA (sub_xxx), e a busca em
      // app/api/webhooks/payments/route.ts nunca encontrava a assinatura.
      const subscriptionDetails = obj.parent?.type === 'subscription_details' ? obj.parent.subscription_details : null
      const gatewaySubscriptionId = subscriptionDetails?.subscription || obj.subscription || obj.id
      const invoiceMetadata = subscriptionDetails?.metadata || obj.metadata

      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId,
        gatewayCustomerId: obj.customer,
        userEmail: obj.customer_email || obj.customer_details?.email,
        externalReference: obj.client_reference_id || invoiceMetadata?.subscription_id || invoiceMetadata?.user_id,
        metadata: invoiceMetadata,
        // BUG CORRIGIDO (validação do zero, 4ª rodada): invoice.payment_failed
        // não checava billing_reason — uma fatura de proração recusada (troca
        // de plano) marcava profiles.subscription_status='past_due' como se a
        // assinatura REGULAR do cliente (que continua em dia) tivesse falhado.
        billingReason: obj.billing_reason,
        // BUG CORRIGIDO (validação do zero, 4ª rodada): base para o webhook
        // conseguir descartar um evento subscription.plan_changed entregue
        // fora de ordem (a Stripe não garante ordem de entrega).
        eventCreatedAt: event.created,
        raw: event
      }
    },
    
    async cancelSubscription(gatewaySubscriptionId) {
      // Use POST /v1/subscriptions/{id} with cancel_at_period_end=true
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${gatewaySubscriptionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'cancel_at_period_end=true'
      })
      if (!response.ok) {
        throw new Error(`Stripe cancel error: ${await response.text()}`)
      }
    }
  }
}
