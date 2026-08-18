import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent } from './types'

export function pagarmeAdapter(apiKey: string): GatewayAdapter {
  const basicAuth = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
  
  return {
    name: 'pagarme',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card' || !paymentData.creditCard || !paymentData.billingAddress || !paymentData.doc) {
        throw new Error('Pagar.me: Checkout transparente requer cartão de crédito, CPF/CNPJ e endereço.')
      }

      const price = plan.price
        
      const interval = plan.billingCycle === 'annual' ? 'year' : 'month'
      const intervalCount = 1
      const docClean = paymentData.doc ? paymentData.doc.replace(/\D/g, '') : ''
      const docType = docClean.length === 14 ? 'CNPJ' : 'CPF'
      let phoneClean = (paymentData.phone || '11999999999').replace(/\D/g, '')
      if (phoneClean.length === 10) {
        phoneClean = phoneClean.slice(0, 2) + '9' + phoneClean.slice(2)
      } else if (phoneClean.length < 10) {
        phoneClean = '11999999999' // safe fallback for testing
      }
        
      const body = {
        payment_method: 'credit_card',
        interval,
        interval_count: intervalCount,
        billing_type: 'exact_day', // Pagar.me recommended for cc subscriptions
        items: [{
          description: plan.name,
          quantity: 1,
          pricing_scheme: { price: Math.round(price * 100) }
        }],
        customer: {
          name: user.name || paymentData.creditCard.holderName,
          email: user.email,
          type: docClean.length === 14 ? 'company' : 'individual',
          document: docClean,
          phones: {
            mobile_phone: {
              country_code: '55',
              area_code: phoneClean.slice(0, 2),
              number: phoneClean.slice(2, 11)
            }
          }
        },
        card: {
          number: paymentData.creditCard.number,
          holder_name: paymentData.creditCard.holderName,
          exp_month: parseInt(paymentData.creditCard.expMonth, 10),
          exp_year: parseInt(paymentData.creditCard.expYear, 10),
          cvv: paymentData.creditCard.cvv,
          billing_address: {
            line_1: `${paymentData.billingAddress.number}, ${paymentData.billingAddress.street}, ${paymentData.billingAddress.neighborhood}`,
            zip_code: paymentData.billingAddress.cep.replace(/\D/g, ''),
            city: paymentData.billingAddress.city,
            state: paymentData.billingAddress.state,
            country: 'BR'
          }
        },
        metadata: { user_id: user.id, subscription_id: subscriptionId }
      }

      const response = await fetch('https://api.pagar.me/core/v5/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': basicAuth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      
      if (!response.ok) {
        throw new Error(`Pagar.me erro na assinatura: ${await response.text()}`)
      }
      
      const data = await response.json()
      
      // Transparent checkout: no checkoutUrl
      return { 
        checkoutUrl: '',
        gatewaySubscriptionId: data.id,
        gatewayCustomerId: data.customer?.id
      }
    },
    
    async validateWebhook(body, headers, secret) {
      const sigHeader = headers['x-hub-signature']
      if (!sigHeader) throw new Error('Missing Pagar.me signature')
      
      if (!secret) {
        throw new Error('Pagar.me webhook secret not configured. Rejecting webhook.')
      }

      const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')
      const hashOnly = sigHeader.replace('sha256=', '')
      if (hashOnly !== expectedSig) {
        throw new Error('Invalid Pagar.me signature')
      }
      
      const event = JSON.parse(body)
      let type: WebhookEvent['type'] = 'unknown'

      // Pagar.me v5 real event names (verified against official docs):
      // - First payment activation: 'charge.paid' or 'invoice.paid' (NOT 'subscription.created'!
      //   subscription.created fires even before payment, so it means 'pending' not 'active')
      // - Renewal: same events — 'charge.paid' / 'invoice.paid' on subsequent billing cycles
      // - Cancellation: 'subscription.canceled' (one 'l' — Pagar.me spelling)
      // - Failure: 'charge.payment_failed' / 'invoice.payment_failed'
      if (event.type === 'charge.paid' || event.type === 'invoice.paid') {
        if (event.data?.subscription || event.data?.subscription_id) {
          type = 'subscription.activated'
        }
      }
      // Note: webhook handler converts 'activated' to 'renewed' for already-active subscriptions
      if (event.type === 'subscription.canceled') type = 'subscription.cancelled'
      if (event.type === 'charge.payment_failed' || event.type === 'invoice.payment_failed') {
        if (event.data?.subscription || event.data?.subscription_id) type = 'payment.failed'
      }
      
      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId: event.data?.subscription?.id || event.data?.id,
        gatewayCustomerId: event.data?.customer?.id || event.data?.subscription?.customer?.id,
        userEmail: event.data?.customer?.email || event.data?.subscription?.customer?.email,
        // Pagar.me v5: metadata is on the charge/invoice object, not on the subscription directly
        externalReference: event.data?.metadata?.subscription_id || event.data?.subscription?.metadata?.subscription_id,
        raw: event
      }
    },
    
    async cancelSubscription(gatewaySubscriptionId) {
      const response = await fetch(`https://api.pagar.me/core/v5/subscriptions/${gatewaySubscriptionId}?cancel_pending=true`, {
        method: 'DELETE',
        headers: { 'Authorization': basicAuth }
      })
      
      if (!response.ok) {
        throw new Error(`Pagar.me cancel error: ${await response.text()}`)
      }
    }
  }
}
