import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent } from './types'
import { assinaturaConfere, timestampRecente } from './signature'

export function mercadoPagoAdapter(accessToken: string): GatewayAdapter {
  return {
    name: 'mercadopago',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card' || !paymentData.gatewayToken) {
        throw new Error('Mercado Pago integration here requires a valid card token from the frontend.')
      }

      // 1. Create Preapproval (Subscription) using the token

      const transactionAmount = plan.price
      const frequency = plan.billingCycle === 'annual' ? 12 : 1

      const body = {
        auto_recurring: {
          frequency,
          frequency_type: 'months',
          transaction_amount: transactionAmount,
          currency_id: 'BRL'
        },
        back_url: 'https://localhost', // Required by API but unused in transparent
        payer_email: user.email,
        card_token_id: paymentData.gatewayToken,
        reason: plan.name,
        external_reference: subscriptionId,
        status: 'authorized' // Forces immediate charge
      }

      const response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      
      if (!response.ok) {
        throw new Error(`Mercado Pago erro na assinatura: ${await response.text()}`)
      }
      
      const data = await response.json()
      
      return { checkoutUrl: '', gatewaySubscriptionId: data.id }
    },
    
    async validateWebhook(body, headers, secret) {
      const sigHeader = headers['x-signature']
      
      // If no signature header AND no secret configured, allow through (development/test mode)
      if (!sigHeader && !secret) {
        console.warn('[MP Webhook] No x-signature header and no secret configured — allowing through in test mode')
      } else if (!sigHeader) {
        throw new Error('Missing MP x-signature header')
      }
      
      // Parse signature parts only if header present
      const parts: Record<string, string> = {}
      if (sigHeader) {
        sigHeader.split(',').forEach(part => {
          const eqIdx = part.indexOf('=')
          if (eqIdx > -1) parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim()
        })
      }
      
      const payloadObj = JSON.parse(body)
      const dataId = payloadObj.data?.id
      if (!dataId) throw new Error('Missing data.id in MP webhook')
      
      if (!secret) {
        throw new Error('Mercado Pago webhook secret not configured. Rejecting webhook.')
      }

      if (secret && sigHeader) {
        // O ts entra no payload assinado, então é confiável — mas sem checar a
        // idade, uma requisição válida capturada pode ser reenviada sempre.
        if (!timestampRecente(parts.ts)) {
          throw new Error('MP webhook timestamp outside tolerance (replay)')
        }

        const payloadToSign = `id:${dataId};request-date:${parts.ts};`
        const expectedSig = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex')
        if (!assinaturaConfere(expectedSig, parts.v1)) {
          throw new Error('Invalid MP signature')
        }
      }
      
      let type: WebhookEvent['type'] = 'unknown'

      // MP sends webhooks for multiple event types: 'subscription_preapproval', 'payment', etc.
      if (payloadObj.action === 'subscription_preapproval' || payloadObj.type === 'subscription_preapproval') {
        // Fetch preapproval details to determine real status
        const preapprovalRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        
        let externalReference: string | undefined = undefined
        let payerEmail: string | undefined = undefined
        let gatewaySubscriptionId = dataId
        
        if (preapprovalRes.ok) {
          const preapproval = await preapprovalRes.json()
          externalReference = preapproval.external_reference
          payerEmail = preapproval.payer_email
          
          if (preapproval.status === 'cancelled') type = 'subscription.cancelled'
          else if (preapproval.status === 'authorized') type = 'subscription.activated'
          else if (preapproval.status === 'pending') type = 'unknown'
        } else {
          console.warn(`[MP Webhook] Could not fetch preapproval ${dataId}: ${preapprovalRes.status}`)
        }
        
        return {
          type,
          eventId: payloadObj.id ? String(payloadObj.id) : `mp_${dataId}`,
          gatewaySubscriptionId,
          userEmail: payerEmail,
          externalReference,
          raw: payloadObj
        }
      } 
      else if (payloadObj.action === 'payment.created' || payloadObj.type === 'payment') {
        // Renewal payments
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (paymentRes.ok) {
          const payment = await paymentRes.json()
          if (payment.status === 'approved') type = 'subscription.renewed'
          else if (payment.status === 'rejected') type = 'payment.failed'
          else type = 'unknown'

          return {
            type,
            eventId: payloadObj.id ? String(payloadObj.id) : `mp_pay_${dataId}`,
            gatewaySubscriptionId: '', // Handled by fallback to externalReference in route.ts
            userEmail: payment.payer?.email,
            externalReference: payment.external_reference,
            raw: payloadObj
          }
        }
      }

      // Unhandled event type
      return { 
        type: 'unknown', 
        eventId: payloadObj.id ? String(payloadObj.id) : `mp_${dataId}`,
        gatewaySubscriptionId: dataId, 
        raw: payloadObj 
      }
    },
    
    async cancelSubscription(gatewaySubscriptionId) {
      const response = await fetch(`https://api.mercadopago.com/preapproval/${gatewaySubscriptionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'cancelled' })
      })
      
      if (!response.ok) {
        throw new Error(`MP cancel error: ${await response.text()}`)
      }
    }
  }
}
