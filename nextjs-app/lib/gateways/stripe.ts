import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent } from './types'

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
      const custParams = new URLSearchParams()
      if (user.email) custParams.append('email', user.email)
      custParams.append('name', user.name || 'User')
      custParams.append('payment_method', pmId)
      custParams.append('invoice_settings[default_payment_method]', pmId)
      
      const custRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: custParams.toString()
      })
      if (!custRes.ok) {
        throw new Error(`Stripe erro ao criar cliente: ${await custRes.text()}`)
      }
      const customer = await custRes.json()

      // 3. Create Subscription
      const subParams = new URLSearchParams()
      subParams.append('customer', customer.id)
      subParams.append('items[0][price_data][currency]', 'brl')
      subParams.append('items[0][price_data][product_data][name]', plan.name)
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
      
      const payload = `${parts.t}.${body}`
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
      if (expectedSig !== parts.v1) {
        throw new Error('Invalid Stripe signature')
      }
      
      const event = JSON.parse(body)
      // Declare obj early — needed inside if/else branches (e.g., billing_reason check)
      const obj = event.data?.object || {}
      let type: WebhookEvent['type'] = 'unknown'
      
      if (event.type === 'checkout.session.completed') {
        type = 'subscription.activated'
      } else if (event.type === 'invoice.payment_succeeded') {
        const billingReason = obj.billing_reason
        if (billingReason === 'subscription_create') {
          type = 'subscription.activated'
        } else if (billingReason === 'subscription_cycle') {
          type = 'subscription.renewed'
        } else {
          type = 'unknown'
        }
      } else if (event.type === 'customer.subscription.deleted') {
        type = 'subscription.cancelled'
      } else if (event.type === 'invoice.payment_failed') {
        type = 'payment.failed'
      }
      
      // For checkout.session.completed, subscription ID is in obj.subscription
      // For invoice events, it's in obj.subscription
      // For customer.subscription.deleted, it's obj.id (the subscription itself)
      const gatewaySubscriptionId = obj.subscription || obj.id
      
      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId,
        gatewayCustomerId: obj.customer,
        userEmail: obj.customer_email || obj.customer_details?.email,
        externalReference: obj.client_reference_id || obj.metadata?.subscription_id || obj.metadata?.user_id,
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
