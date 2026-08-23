import { GatewayAdapter, WebhookEvent } from './types'
import { assinaturaConfere } from './signature'

export function asaasAdapter(apiKey: string, environment: 'sandbox' | 'production'): GatewayAdapter {
  // BUG CORRIGIDO: a doc atual de autenticação da Asaas lista
  // https://api-sandbox.asaas.com/v3 como base do sandbox — mesmo padrão de
  // host da produção (api.asaas.com/v3), só trocando o subdomínio. O host
  // antigo (sandbox.asaas.com/api/v3, com /api/ no path) ainda responde hoje,
  // mas não consta na documentação atual e pode ser desativado sem aviso.
  const baseUrl = environment === 'sandbox'
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3'

  // A doc de autenticação da Asaas exige o header User-Agent para contas raiz
  // criadas a partir de 13/06/2024 — nenhuma chamada enviava esse header.
  const headers = {
    'access_token': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'TauzeClass/1.0 (+https://tauzeclass.com.br)',
  }

  return {
    name: 'asaas',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card' || !paymentData.creditCard || !paymentData.billingAddress || !paymentData.doc) {
        throw new Error('Asaas: Checkout transparente requer cartão de crédito, CPF/CNPJ e endereço de cobrança.')
      }
      if (!paymentData.ip) {
        throw new Error('Asaas: IP do cliente é obrigatório (remoteIp).')
      }

      const docClean = paymentData.doc.replace(/\D/g, '')
      if (docClean.length !== 11 && docClean.length !== 14) {
        throw new Error('Asaas: CPF/CNPJ inválido para o cliente.')
      }

      // 1. Buscar cliente existente antes de criar.
      //
      // BUG CRÍTICO CORRIGIDO: a ordem era criar primeiro e só buscar se a
      // criação retornasse 400/409. A doc oficial ("Criando um cliente")
      // afirma o oposto — a Asaas PERMITE clientes duplicados, e o fluxo
      // recomendado é buscar antes de criar. Na prática, repetir POST
      // /customers para o mesmo CPF tende a responder 200 com um id NOVO, não
      // um erro — então o branch de fallback quase nunca era alcançado para o
      // caso em que foi escrito, e cada nova tentativa de checkout fora da
      // janela de lock de 15s (app/api/checkout/route.ts) criava um cliente
      // Asaas duplicado.
      let customerId: string | undefined

      const findByRefRes = await fetch(`${baseUrl}/customers?externalReference=${encodeURIComponent(user.id)}&limit=1`, { headers })
      if (findByRefRes.ok) {
        const findByRefData = await findByRefRes.json()
        customerId = findByRefData.data?.[0]?.id
      }

      if (!customerId) {
        const findByDocRes = await fetch(`${baseUrl}/customers?cpfCnpj=${docClean}&limit=1`, { headers })
        if (findByDocRes.ok) {
          const findByDocData = await findByDocRes.json()
          customerId = findByDocData.data?.[0]?.id
        }
      }

      if (!customerId) {
        const customerRes = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: user.name || 'User',
            email: user.email,
            cpfCnpj: docClean,
            externalReference: user.id
          })
        })
        if (!customerRes.ok) {
          throw new Error(`Asaas customer error: ${await customerRes.text()}`)
        }
        const customerData = await customerRes.json()
        customerId = customerData.id
      }

      // 2. Create Subscription with Transparent Checkout
      const value = plan.price
      const cycle = plan.billingCycle === 'annual' ? 'YEARLY' : 'MONTHLY'

      // Fix timezone shift for Asaas by formatting local date explicitly
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const nextDueDateStr = `${year}-${month}-${day}`

      let phoneClean = (paymentData.phone || '11999999999').replace(/\D/g, '')
      if (phoneClean.length === 10) phoneClean = phoneClean.slice(0, 2) + '9' + phoneClean.slice(2)
      if (phoneClean.length < 10) phoneClean = '11999999999'

      const subRes = await fetch(`${baseUrl}/subscriptions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer: customerId,
          billingType: 'CREDIT_CARD',
          value: value,
          nextDueDate: nextDueDateStr,
          cycle,
          description: plan.name,
          externalReference: subscriptionId,
          // BUG CRÍTICO CORRIGIDO: remoteIp está no array `required` do schema
          // oficial de POST /v3/subscriptions com cartão — sem ele, a Asaas
          // rejeitava toda criação de assinatura por cartão.
          remoteIp: paymentData.ip,
          creditCard: {
            holderName: paymentData.creditCard.holderName,
            number: paymentData.creditCard.number,
            expiryMonth: paymentData.creditCard.expMonth,
            expiryYear: paymentData.creditCard.expYear,
            ccv: paymentData.creditCard.cvv
          },
          creditCardHolderInfo: {
            name: user.name || paymentData.creditCard.holderName,
            email: user.email,
            cpfCnpj: docClean,
            postalCode: paymentData.billingAddress.cep.replace(/\D/g, ''),
            addressNumber: paymentData.billingAddress.number,
            phone: phoneClean
          }
        })
      })

      if (!subRes.ok) {
        throw new Error(`Asaas erro na assinatura: ${await subRes.text()}`)
      }

      const subData = await subRes.json()

      return {
        checkoutUrl: '', // Transparent
        gatewaySubscriptionId: subData.id,
        gatewayCustomerId: customerId
      }
    },

    async validateWebhook(body, headers, secret) {
      const token = headers['asaas-access-token']

      if (!secret) {
        throw new Error('Asaas webhook token not configured. Rejecting webhook.')
      }

      // Token estático (não é HMAC), mas a comparação continua sujeita a timing
      // attack como qualquer igualdade de segredo — mesma classe de correção
      // já aplicada em stripe/mercadopago/pagarme.ts nesta sessão. `!==` fazia
      // essa comparação parar no primeiro byte diferente.
      if (!assinaturaConfere(secret, token)) {
        throw new Error('Invalid Asaas access token')
      }

      const event = JSON.parse(body)
      let type: WebhookEvent['type'] = 'unknown'

      // Asaas event mapping:
      // PAYMENT_RECEIVED / PAYMENT_CONFIRMED:
      //   - If subscription has no prior active status → first payment = activated
      //   - Subsequent payments = renewed
      //   We always emit 'subscription.activated' for the first received payment;
      //   the webhook handler will upgrade it to 'renewed' for already-active subs.
      if (event.event === 'PAYMENT_RECEIVED' || event.event === 'PAYMENT_CONFIRMED') {
        if (event.payment?.subscription) {
          type = 'subscription.activated'  // webhook handler will handle both activate and renew
        }
      }
      // BUG CRÍTICO CORRIGIDO: 'PAYMENT_REJECTED' não existe na lista oficial
      // de eventos de cobrança da Asaas — metade desta condição era código
      // morto. Os eventos reais de recusa de cobrança recorrente em cartão
      // são PAYMENT_CREDIT_CARD_CAPTURE_REFUSED (recusa na captura) e
      // PAYMENT_REPROVED_BY_RISK_ANALYSIS (reprovado em análise de risco
      // manual); nenhum dos dois era tratado, então uma recusa de cobrança
      // ficava em 'unknown' e o usuário continuava com o plano ativo até a
      // Asaas eventualmente marcar a cobrança como PAYMENT_OVERDUE.
      if (
        event.event === 'PAYMENT_OVERDUE' ||
        event.event === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' ||
        event.event === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS'
      ) {
        if (event.payment?.subscription) type = 'payment.failed'
      }
      // Cancellation events
      if (event.event === 'SUBSCRIPTION_DELETED' || event.event === 'PAYMENT_DELETED') type = 'subscription.cancelled'

      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId: event.payment?.subscription || event.subscription?.id,
        gatewayCustomerId: event.payment?.customer || event.subscription?.customer,
        // Asaas: externalReference is set on subscription, not always on payment object
        // Try payment.externalReference first, then subscription.externalReference as fallback
        externalReference: event.payment?.externalReference || event.subscription?.externalReference,
        raw: event
      }
    },

    async cancelSubscription(gatewaySubscriptionId) {
      const response = await fetch(`${baseUrl}/subscriptions/${gatewaySubscriptionId}`, {
        method: 'DELETE',
        headers,
      })
      if (!response.ok) {
        throw new Error(`Asaas cancel error: ${await response.text()}`)
      }
    }
  }
}
