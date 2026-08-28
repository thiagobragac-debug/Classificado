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
      // Fail-closed único, sem branch de "modo teste": antes havia um bloco
      // que só dava console.warn quando faltavam header E secret ao mesmo
      // tempo, sugerindo um bypass — mas duas linhas depois um segundo
      // `if (!secret) throw` incondicional já pegava esse mesmo caso, então
      // nunca existiu bypass de verdade (provado em
      // lib/gateways/webhooks.test.ts). Removido por confundir a leitura.
      if (!secret) {
        throw new Error('Mercado Pago webhook secret not configured. Rejecting webhook.')
      }

      const sigHeader = headers['x-signature']
      if (!sigHeader) throw new Error('Missing MP x-signature header')

      const parts: Record<string, string> = {}
      sigHeader.split(',').forEach(part => {
        const eqIdx = part.indexOf('=')
        if (eqIdx > -1) parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim()
      })

      const payloadObj = JSON.parse(body)
      const dataId = payloadObj.data?.id
      if (!dataId) throw new Error('Missing data.id in MP webhook')

      // O ts entra no payload assinado, então é confiável — mas sem checar a
      // idade, uma requisição válida capturada pode ser reenviada sempre.
      if (!timestampRecente(parts.ts)) {
        throw new Error('MP webhook timestamp outside tolerance (replay)')
      }

      // BUG CRÍTICO CORRIGIDO: o manifesto assinado documentado pelo Mercado
      // Pago tem TRÊS componentes — id, request-id (do header x-request-id) e
      // ts —, nessa ordem, com data.id normalizado para minúsculas. O código
      // anterior omitia request-id por completo e usava o nome de campo
      // "request-date" (que não existe na doc) em vez de "request-id". Duas
      // divergências já bastam para o HMAC nunca bater; havia três. O ID usado
      // para CONSULTAR a API (fetch abaixo) continua no formato original — só
      // o usado dentro do manifesto assinado é normalizado, como a doc pede.
      const dataIdLower = String(dataId).toLowerCase()
      const requestId = headers['x-request-id'] || ''
      const payloadToSign = `id:${dataIdLower};request-id:${requestId};ts:${parts.ts};`
      const expectedSig = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex')
      if (!assinaturaConfere(expectedSig, parts.v1)) {
        throw new Error('Invalid MP signature')
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
          
          // BUG CRÍTICO CORRIGIDO: a doc do Preapproval API usa a grafia
          // americana 'canceled' (um L) como valor do campo status — não
          // 'cancelled' (dois L). Com a grafia errada, uma assinatura
          // cancelada por qualquer motivo fora do nosso painel (inadimplência,
          // fraude, ou o usuário cancelando direto no app do Mercado Pago)
          // nunca era reconhecida aqui: type ficava 'unknown', o webhook route
          // respondia {handled:false} sem tocar em nada, e o usuário mantinha
          // acesso premium mesmo com a assinatura já cancelada no gateway.
          if (preapproval.status === 'canceled') type = 'subscription.cancelled'
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
        // 'canceled' (um L) é o valor documentado pela API — ver o comentário
        // equivalente em validateWebhook.
        body: JSON.stringify({ status: 'canceled' })
      })

      if (!response.ok) {
        throw new Error(`MP cancel error: ${await response.text()}`)
      }
    },

    // BUG CORRIGIDO (validação do zero, rodada 6): sem este método, toda
    // troca de plano no Mercado Pago caía no fallback de cancelar a
    // assinatura antiga e criar uma nova — cobrando o preço cheio na hora,
    // mesmo em DOWNGRADE (contradizendo o FAQ de /planos). A doc do
    // Preapproval API permite atualizar auto_recurring.transaction_amount de
    // uma assinatura já 'authorized' via este mesmo PUT usado acima pra
    // cancelar — isso muda só o valor cobrado na PRÓXIMA renovação
    // automática, sem gerar cobrança imediata. O Mercado Pago não tem
    // conceito de proração, então (igual à Asaas) `prorate` é ignorado de
    // propósito — checkout/route.ts só usa este caminho pra DOWNGRADE nesta
    // gateway, mantendo upgrade no fallback de cancelar+recriar.
    //
    // ⚠️ NÃO TESTADO AO VIVO: as credenciais de Mercado Pago configuradas
    // neste ambiente são inválidas/placeholder (achado conhecido, não é bug
    // deste método) — não foi possível confirmar contra a API real que o
    // corpo/resposta têm exatamente este formato. Validar contra o sandbox
    // real do MP antes de confiar cegamente neste caminho em produção.
    async updateSubscriptionPlan(gatewaySubscriptionId, plan) {
      const response = await fetch(`https://api.mercadopago.com/preapproval/${gatewaySubscriptionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: plan.name,
          auto_recurring: {
            transaction_amount: plan.price,
            currency_id: 'BRL',
          },
        })
      })
      if (!response.ok) {
        throw new Error(`MP erro ao trocar plano da assinatura: ${await response.text()}`)
      }
      const updated = await response.json()
      const nextPaymentDate = updated.auto_recurring?.next_payment_date || updated.next_payment_date
      return {
        gatewaySubscriptionId: updated.id,
        currentPeriodEnd: nextPaymentDate ? new Date(nextPaymentDate).toISOString() : undefined,
      }
    }
  }
}
