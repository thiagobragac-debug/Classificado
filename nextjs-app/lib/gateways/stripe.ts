import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent, GatewayDeclinedError, recusadoPeloGateway } from './types'
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
      //
      // As chaves são estáveis por checkoutId (retentativa AMBÍGUA -- rede
      // caiu depois de a Stripe cobrar -- devolve a assinatura já criada em
      // vez de cobrar de novo). Depois de uma recusa DEFINITIVA a rota
      // responde 402 e o modal gera um checkoutId novo (ver
      // GatewayDeclinedError em types.ts).
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
        const detalhe = `Stripe erro ao criar cliente: ${await custRes.text()}`
        throw recusadoPeloGateway(custRes.status) ? new GatewayDeclinedError(detalhe) : new Error(detalhe)
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
      // BUG CORRIGIDO (achado ao vivo, 2026-09-01): moeda vinha hardcoded em
      // 'brl' — todo cliente internacional era cobrado em Real, convertido
      // pela bandeira do cartão dele na taxa/spread dela, sem preço
      // "nativo" nenhum. plan.currency vem de app/api/checkout/route.ts,
      // que escolhe price_usd (cadastrado no admin, ver
      // app/(admin)/admin/planos/page.tsx) quando o gateway é Stripe e o
      // usuário é internacional; cai pra 'brl' quando price_usd não está
      // configurado (comportamento antigo preservado).
      subParams.append('items[0][price_data][currency]', (plan.currency || 'brl').toLowerCase())
      subParams.append('items[0][price_data][product]', product.id)
      subParams.append('items[0][price_data][recurring][interval]', plan.billingCycle === 'annual' ? 'year' : 'month')
      const priceInCents = Math.round(plan.price * 100)
      subParams.append('items[0][price_data][unit_amount]', priceInCents.toString())

      subParams.append('metadata[user_id]', user.id)
      subParams.append('metadata[plan_id]', plan.id)
      subParams.append('metadata[billing_cycle]', plan.billingCycle)
      subParams.append('metadata[subscription_id]', subscriptionId)
      // BUG CRÍTICO CORRIGIDO (achado ao vivo, 03/out/2026): sem isto o
      // padrão da Stripe é allow_incomplete -- um cartão que anexa mas é
      // recusado na 1ª cobrança (ou que exige 3DS) devolvia HTTP 200 com a
      // assinatura 'incomplete', e o checkout respondia sucesso a um cliente
      // que nunca pagou (linha local 'pending' para sempre, cupom gasto).
      // error_if_incomplete faz a Stripe responder 402 e NÃO criar a
      // assinatura quando a 1ª fatura não pode ser paga.
      subParams.append('payment_behavior', 'error_if_incomplete')

      // BUG CORRIGIDO (achado ao vivo, teste completo de pagamento, 2026-09-01):
      // a chave era `user+plano+token`, sem nenhum identificador por
      // TENTATIVA — diferente de Customer/Product logo acima, que já usam
      // `subscriptionId` (o checkoutId, único por abertura do modal/retry
      // genuíno da mesma tentativa). Reassinar o MESMO plano com o mesmo
      // PaymentMethod depois de cancelar (ou o fallback de troca de
      // gateway/moeda escolhendo de novo um plano já tentado antes) reusava
      // essa mesma chave: se os parâmetros da nova tentativa divergiam
      // (moeda, por ex.), a Stripe recusava com idempotency_error;
      // reproduzido ao vivo. Se fossem idênticos, a Stripe devolveria a
      // resposta em CACHE da tentativa anterior — risco pior, de mascarar
      // uma cobrança nova como sucesso sem cobrar de verdade. Mesma classe
      // de bug já corrigida em updateSubscriptionPlan (nonce por tentativa
      // via checkoutId) — nunca replicada aqui. `subscriptionId` sozinho já
      // é suficiente: um retry genuíno da MESMA tentativa (conexão caiu,
      // client reenvia) reusa o mesmo checkoutId e continua idempotente; uma
      // tentativa nova sempre tem um checkoutId novo.
      const idempotencyKey = `stripe_sub_${subscriptionId}`

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
        const detalhe = `Stripe erro na assinatura: ${await response.text()}`
        // 4xx (inclui 402 card_error do error_if_incomplete): recusa definitiva.
        throw recusadoPeloGateway(response.status) ? new GatewayDeclinedError(detalhe) : new Error(detalhe)
      }

      const subscription = await response.json()

      // Rede de segurança além do error_if_incomplete: nunca tratar uma
      // assinatura que não nasceu paga como sucesso.
      if (['incomplete', 'incomplete_expired', 'unpaid', 'past_due'].includes(subscription.status)) {
        try {
          await fetch(`https://api.stripe.com/v1/subscriptions/${subscription.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${secretKey}` } })
        } catch { /* melhor esforço */ }
        throw new GatewayDeclinedError(`Stripe: primeira cobrança não confirmada (status=${subscription.status})`)
      }

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
      updateParams.append('items[0][price_data][currency]', (plan.currency || 'brl').toLowerCase())
      updateParams.append('items[0][price_data][product]', product.id)
      updateParams.append('items[0][price_data][recurring][interval]', plan.billingCycle === 'annual' ? 'year' : 'month')
      updateParams.append('items[0][price_data][unit_amount]', Math.round(plan.price * 100).toString())
      updateParams.append('proration_behavior', prorate ? 'always_invoice' : 'none')
      // Achado pela revisão adversarial (03/out/2026): sem payment_behavior o
      // padrão é allow_incomplete -- um upgrade cuja fatura de proração é
      // recusada voltava HTTP 200 (assinatura past_due já com o preço novo) e
      // o checkout gravava a troca como sucesso. error_if_incomplete faz a
      // Stripe responder 402 e NÃO aplicar a mudança.
      if (prorate) updateParams.append('payment_behavior', 'error_if_incomplete')
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
        // 4xx (inclui a fatura de proração recusada, 402) é definitivo: o
        // cliente rotaciona o checkoutId, senão a nonce de idempotência acima
        // devolveria a mesma recusa em cache a cada nova tentativa.
        const detalhe = `Stripe erro ao trocar plano da assinatura: ${await updateRes.text()}`
        throw recusadoPeloGateway(updateRes.status) ? new GatewayDeclinedError(detalhe) : new Error(detalhe)
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

    // F13: valor recorrente vigente do item (centavos -> unidade principal).
    async getSubscriptionPrice(gatewaySubscriptionId) {
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${gatewaySubscriptionId}`, { headers: { 'Authorization': `Bearer ${secretKey}` } })
      if (!r.ok) return null
      const s = await r.json()
      const cents = s.items?.data?.[0]?.price?.unit_amount
      return typeof cents === 'number' ? cents / 100 : null
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
      // F85 (auditoria 12/out/2026): durante a rotação do segredo de webhook a Stripe
      // envia VÁRIAS assinaturas v1 no mesmo cabeçalho (uma por segredo ativo). O
      // reduce acima guardava só a última, então um evento legítimo assinado pelo
      // segredo antigo-ainda-válido era rejeitado. Aceita se QUALQUER v1 conferir.
      const assinaturasV1 = sigHeader.split(',').map(p => p.trim()).filter(p => p.startsWith('v1=')).map(p => p.slice(3))
      if (!assinaturasV1.some(v1 => assinaturaConfere(expectedSig, v1))) {
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
        // F02: a mesma fatura paga nunca deve estender o período duas vezes.
        ...((type === 'subscription.activated' || type === 'subscription.renewed') && event.type === 'invoice.payment_succeeded' && obj.id
          ? { paymentId: String(obj.id) }
          : {}),
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
      // BUG CORRIGIDO (validação adversarial final): cancel_at_period_end=true
      // mantinha a assinatura ATIVA na Stripe até o fim do período — os
      // outros 3 gateways (Mercado Pago, Pagar.me, Asaas) cancelam DE VEZ,
      // imediatamente, no lado deles. Nosso app já garante "acesso até o fim
      // do período pago" sozinho, só com profiles.plan_expires_at (ver
      // app/api/subscriptions/cancel/route.ts — "Do NOT downgrade plan to
      // 'free' yet"), então a Stripe não precisa continuar tecnicamente
      // ativa pra essa promessa valer. Deixá-la assim criava uma segunda
      // fonte de verdade divergente da nossa: o botão "Reativar" do admin
      // (app/api/admin/subscriptions/reactivate/route.ts) só flipa o status
      // LOCAL, sem chamar gateway nenhum — "funcionava" pra Stripe só
      // porque a assinatura de lá ainda existia por baixo, mas reativaria
      // uma assinatura já genuinamente morta nos outros 3 gateways, sem
      // cobrança futura nenhuma de verdade. DELETE cancela na hora, igual
      // aos outros — o evento customer.subscription.deleted já mapeia para
      // 'subscription.cancelled' (ver validateWebhook acima), que o webhook
      // já trata com a mesma lógica de carência por current_period_end.
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${gatewaySubscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
        },
      })
      // BUG CORRIGIDO (achado ao vivo, teste completo de pagamento,
      // 2026-09-01): reativar uma assinatura (admin) só flipa o status LOCAL,
      // sem recriar nada no gateway (ver app/api/admin/subscriptions/
      // reactivate/route.ts) — o gateway_subscription_id continua apontando
      // pra uma assinatura já deletada de vez por este mesmo DELETE. Uma
      // segunda tentativa de cancelar reproduzia 404 resource_missing (Stripe
      // confirma: um segundo DELETE na mesma subscription responde 404, não
      // 200 idempotente) e as rotas de cancelamento abortavam com 502,
      // travando a assinatura em 'active' pra sempre, sem nenhum caminho de
      // saída via API. Se o gateway já não tem essa assinatura, o objetivo
      // (parar de cobrar) já está cumprido — trata como sucesso.
      if (!response.ok && response.status !== 404) {
        throw new Error(`Stripe cancel error: ${await response.text()}`)
      }
    }
  }
}
