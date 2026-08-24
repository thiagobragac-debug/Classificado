import crypto from 'crypto'
import { GatewayAdapter, WebhookEvent } from './types'
import { assinaturaConfere } from './signature'

export function pagarmeAdapter(apiKey: string): GatewayAdapter {
  const basicAuth = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
  
  return {
    name: 'pagarme',
    async createSubscription(plan, user, paymentData, subscriptionId) {
      // Diferente da Asaas: a tokenização da Pagar.me (POST /core/v5/tokens)
      // autentica só com a public_key, no parâmetro de query `appId` — nunca a
      // secret_key. Por isso pode (e deve) ser chamada DIRETO DO NAVEGADOR,
      // como já é feito com Stripe Elements/MP Bricks; não existe aqui o
      // problema que forçou o proxy de tokenização da Asaas
      // (app/api/checkout/tokenize-card). O card em claro não precisa passar
      // pelo nosso servidor — só falta o cliente chamar essa tokenização e
      // mandar o `id` (ex.: "token_xxx") resultante como gatewayToken.
      if (paymentData.method !== 'card' || !paymentData.billingAddress || !paymentData.doc) {
        throw new Error('Pagar.me: Checkout transparente requer CPF/CNPJ, endereço, e cartão de crédito ou token.')
      }
      if (!paymentData.gatewayToken && !paymentData.creditCard) {
        throw new Error('Pagar.me: Checkout transparente requer CPF/CNPJ, endereço, e cartão de crédito ou token.')
      }

      const price = plan.price

      const interval = plan.billingCycle === 'annual' ? 'year' : 'month'
      const intervalCount = 1
      const docClean = paymentData.doc ? paymentData.doc.replace(/\D/g, '') : ''
      const docType = docClean.length === 14 ? 'CNPJ' : 'CPF'
      const customerType = docType === 'CNPJ' ? 'company' : 'individual'
      let phoneClean = (paymentData.phone || '11999999999').replace(/\D/g, '')
      if (phoneClean.length === 10) {
        phoneClean = phoneClean.slice(0, 2) + '9' + phoneClean.slice(2)
      } else if (phoneClean.length < 10) {
        phoneClean = '11999999999' // safe fallback for testing
      }

      // O billing address do cartão NUNCA é tokenizado pela Pagar.me ("a
      // entidade de billing address do cartão não é tokenizada") — precisa ser
      // enviado aqui de novo mesmo usando card_token.
      const billingAddress = {
        line_1: `${paymentData.billingAddress.number}, ${paymentData.billingAddress.street}, ${paymentData.billingAddress.neighborhood}`,
        zip_code: paymentData.billingAddress.cep.replace(/\D/g, ''),
        city: paymentData.billingAddress.city,
        state: paymentData.billingAddress.state,
        country: 'BR'
      }

      // card_token (gerado por POST /core/v5/tokens no navegador, com a
      // public_key) substitui os dados crus do cartão — nome exato do campo
      // confirmado na doc oficial ("Propriedades do objeto credit_card"):
      // card / card_id / card_token / network_token são mutuamente exclusivos.
      const card = paymentData.gatewayToken
        ? { card_token: paymentData.gatewayToken, billing_address: billingAddress }
        : {
            number: paymentData.creditCard!.number,
            holder_name: paymentData.creditCard!.holderName,
            exp_month: parseInt(paymentData.creditCard!.expMonth, 10),
            exp_year: parseInt(paymentData.creditCard!.expYear, 10),
            cvv: paymentData.creditCard!.cvv,
            billing_address: billingAddress
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
          name: user.name || paymentData.creditCard?.holderName,
          email: user.email,
          type: customerType,
          document: docClean,
          phones: {
            mobile_phone: {
              country_code: '55',
              area_code: phoneClean.slice(0, 2),
              number: phoneClean.slice(2, 11)
            }
          }
        },
        card,
        metadata: { user_id: user.id, subscription_id: subscriptionId }
      }

      const response = await fetch('https://api.pagar.me/core/v5/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': basicAuth,
          'Content-Type': 'application/json',
          // Doc de idempotência do Pagar.me v5 confirma suporte a este header.
          // Sem ele, uma falha de rede após o Pagar.me já ter criado a
          // assinatura (mas antes da resposta chegar aqui) faria um retry
          // criar uma SEGUNDA assinatura de cartão para o mesmo cliente,
          // cobrando-o duas vezes.
          'Idempotency-Key': `pagarme-sub-${subscriptionId}`,
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
      // NÃO CONFIRMADO CONTRA A DOC ATUAL — revisar antes de configurar
      // pagarme_webhook_secret em produção. Busca extensiva na documentação
      // oficial do Pagar.me v5 (visão geral de webhooks, exemplo de payload,
      // página de autenticação) não encontrou nenhuma menção a um header
      // 'x-hub-signature' nem a HMAC-SHA256 sobre o corpo — os mecanismos de
      // segurança documentados são IP allowlist (para chamadas AO Pagar.me,
      // não deste endpoint) e um campo opcional de senha/autenticação na tela
      // de cadastro do webhook no dashboard. Hoje isso fica encoberto porque
      // pagarme_webhook_secret está vazio (fail-closed abaixo rejeita tudo).
      // Antes de preencher esse secret em produção, confirmar com um webhook
      // real (RequestBin ou o simulador do próprio dashboard) qual mecanismo
      // o Pagar.me de fato envia, e ajustar esta função de acordo.
      const sigHeader = headers['x-hub-signature']
      if (!sigHeader) throw new Error('Missing Pagar.me signature')

      if (!secret) {
        throw new Error('Pagar.me webhook secret not configured. Rejecting webhook.')
      }

      const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')
      const hashOnly = sigHeader.replace('sha256=', '')
      if (!assinaturaConfere(expectedSig, hashOnly)) {
        throw new Error('Invalid Pagar.me signature')
      }

      const event = JSON.parse(body)
      let type: WebhookEvent['type'] = 'unknown'
      const dataObj = event.data || {}

      // BUG CRÍTICO CORRIGIDO: para eventos charge.* (event.data = objeto
      // Cobrança), a doc oficial confirma que Charge NÃO tem campo
      // 'subscription' nem 'subscription_id' — só o objeto Fatura (Invoice,
      // em event.data.invoice) tem 'subscription'. A condição antiga
      // (`event.data?.subscription`) era sempre falsa para charge.*, então
      // ativação/renovação via esse evento nunca era reconhecida e caía
      // silenciosamente em 'unknown'. Só invoice.paid/invoice.payment_failed
      // funcionavam, porque ali event.data já É o Invoice.
      const subscriptionRef = dataObj.subscription || dataObj.invoice?.subscription

      // Pagar.me v5 real event names (nomes já verificados contra a doc
      // oficial nesta sessão — só o ESQUEMA DE ASSINATURA acima é que não foi):
      // - Ativação/renovação: 'charge.paid' ou 'invoice.paid'
      // - Cancelamento: 'subscription.canceled' (uma L — grafia americana do Pagar.me)
      // - Falha: 'charge.payment_failed' / 'invoice.payment_failed'
      if (event.type === 'charge.paid' || event.type === 'invoice.paid') {
        if (subscriptionRef) type = 'subscription.activated'
      }
      // Note: webhook handler converts 'activated' to 'renewed' for already-active subscriptions
      if (event.type === 'subscription.canceled') type = 'subscription.cancelled'
      if (event.type === 'charge.payment_failed' || event.type === 'invoice.payment_failed') {
        if (subscriptionRef) type = 'payment.failed'
      }

      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId: subscriptionRef?.id || dataObj.id,
        gatewayCustomerId: dataObj.customer?.id || subscriptionRef?.customer?.id,
        userEmail: dataObj.customer?.email || subscriptionRef?.customer?.email,
        // Pagar.me v5: metadata is on the charge/invoice object, not on the subscription directly
        externalReference: dataObj.metadata?.subscription_id || subscriptionRef?.metadata?.subscription_id,
        raw: event
      }
    },

    async cancelSubscription(gatewaySubscriptionId) {
      const response = await fetch(`https://api.pagar.me/core/v5/subscriptions/${gatewaySubscriptionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': basicAuth, 'Content-Type': 'application/json' },
        // BUG CORRIGIDO: o nome documentado é 'cancel_pending_invoices', e vai
        // no CORPO da requisição DELETE — não '?cancel_pending=true' na
        // query string. APIs REST costumam ignorar parâmetro de query
        // desconhecido em silêncio, então a chamada antiga "funcionava"
        // (DELETE retornava 200) mas nunca controlava de fato esse
        // comportamento — o resultado real dependia só do valor default
        // (true) que a própria Pagar.me já usa quando o campo não é enviado.
        body: JSON.stringify({ cancel_pending_invoices: true }),
      })

      if (!response.ok) {
        throw new Error(`Pagar.me cancel error: ${await response.text()}`)
      }
    }
  }
}
