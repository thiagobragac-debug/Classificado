import { GatewayAdapter, WebhookEvent } from './types'
import { assinaturaConfere } from './signature'

export function asaasAdapter(apiKey: string, environment: 'sandbox' | 'production'): GatewayAdapter {
  const baseUrl = environment === 'sandbox' 
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3'
    
  return {
    name: 'asaas',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card' || !paymentData.creditCard || !paymentData.billingAddress || !paymentData.doc) {
        throw new Error('Asaas: Checkout transparente requer cartão de crédito, CPF/CNPJ e endereço de cobrança.')
      }

      const docClean = paymentData.doc.replace(/\D/g, '')
      if (docClean.length !== 11 && docClean.length !== 14) {
        throw new Error('Asaas: CPF/CNPJ inválido para o cliente.')
      }

      // 1. Create or find existing Customer
      let customerId: string
      const customerRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: user.name || 'User',
          email: user.email,
          cpfCnpj: docClean,
          externalReference: user.id
        })
      })
      
      if (customerRes.ok) {
        const customerData = await customerRes.json()
        customerId = customerData.id
      } else if (customerRes.status === 409 || customerRes.status === 400) {
        // Customer already exists or doc invalid for creation — try to find by CPF/CNPJ or externalReference
        const findRes = await fetch(`${baseUrl}/customers?cpfCnpj=${docClean}&limit=1`, {
          headers: { 'access_token': apiKey }
        })
        const findData = await findRes.json()
        if (findData.data?.[0]?.id) {
          customerId = findData.data[0].id
        } else {
          // fallback to externalReference
          const findExtRes = await fetch(`${baseUrl}/customers?externalReference=${encodeURIComponent(user.id)}&limit=1`, {
            headers: { 'access_token': apiKey }
          })
          const findExtData = await findExtRes.json()
          if (!findExtData.data?.[0]?.id) throw new Error(`Asaas customer error: ${await customerRes.text()}`)
          customerId = findExtData.data[0].id
        }
      } else {
        throw new Error(`Asaas customer error: ${await customerRes.text()}`)
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
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: customerId,
          billingType: 'CREDIT_CARD',
          value: value,
          nextDueDate: nextDueDateStr,
          cycle,
          description: plan.name,
          externalReference: subscriptionId,
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
      if (event.event === 'PAYMENT_OVERDUE' || event.event === 'PAYMENT_REJECTED') {
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
        headers: { 'access_token': apiKey }
      })
      if (!response.ok) {
        throw new Error(`Asaas cancel error: ${await response.text()}`)
      }
    }
  }
}
