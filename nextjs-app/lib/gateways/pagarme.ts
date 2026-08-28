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
          // Achado de verificação contra a doc oficial (2026-08-24):
          // document_type não é obrigatório no schema, mas aparece PAREADO
          // com document em todo exemplo funcional da doc de criar
          // assinatura — faltava aqui mesmo já tendo o valor calculado
          // (docType) para decidir customerType. Sem ele, a checagem
          // antifraude da primeira cobrança da assinatura (que a doc de
          // erros menciona exigir dados completos do cliente) corre com
          // menos informação do que o esperado pela API.
          document_type: docType,
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
          // CORRIGIDO (verificação contra a doc oficial, 2026-08-24): o
          // comentário aqui afirmava que "a doc confirma suporte a este
          // header" neste endpoint especificamente — não é bem isso. A doc
          // de idempotência (docs.pagar.me/docs/o-que-é) documenta
          // "Idempotency-Key" como mecanismo GERAL da API (chave expira 24h
          // em produção, 5min em sandbox; requisição concorrente com a
          // mesma chave devolve 409), mas as páginas de referência OpenAPI
          // do próprio endpoint de criar assinatura não listam esse header
          // como parâmetro. Mantido por ser uma proteção razoável e de baixo
          // risco (evita cobrar duas vezes num retry de rede), só não é
          // "confirmado por escrito" para /subscriptions especificamente.
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
      // ⚠️ CONFIRMADO SEM BASE DOCUMENTAL (varredura extensiva em 2026-08-24
      // contra docs.pagar.me: visão geral de webhooks, eventos, exemplo de
      // payload, criar/listar/obter webhook, segurança, IP allowlist) —
      // NENHUMA página oficial do Pagar.me v5 documenta HMAC, assinatura
      // criptográfica, ou um header 'x-hub-signature' para webhooks. Os
      // únicos mecanismos de segurança documentados (Basic Auth, IP
      // allowlist) são para chamadas DE ENTRADA feitas À API do Pagar.me —
      // sentido inverso do que esta função precisa validar (uma notificação
      // que o Pagar.me ENVIA para nós). Existe um campo opcional de "senha"
      // na tela de cadastro do webhook no dashboard (mencionado só em um
      // artigo de suporte de terceiros, fora da doc oficial) cuja semântica
      // exata (Basic Auth na URL? outra coisa?) não está confirmada.
      //
      // NÃO PREENCHER pagarme_webhook_secret em produção até resolver isso
      // de verdade (inspecionar os headers de um webhook real de teste no
      // dashboard, ou perguntar ao suporte do Pagar.me) — do jeito que essa
      // função está, preencher o secret faz a UI mostrar "configurado" mas
      // REJEITA 100% dos webhooks reais (o Pagar.me quase certamente nunca
      // manda 'x-hub-signature'), uma falsa sensação de segurança pior do
      // que deixar vazio. Hoje o secret está vazio, então o fail-closed
      // abaixo já rejeita tudo de qualquer forma — sem efeito prático ainda.
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

      // Pagar.me v5 real event names (lista completa de docs.pagar.me/
      // reference/eventos-de-webhook-1, verificada nesta sessão — a única
      // lista de subscription.* documentada na v5 atual é
      // subscription.created/subscription.canceled, sem updated/suspended):
      // - Ativação/renovação: 'charge.paid' ou 'invoice.paid'
      // - Cancelamento: 'subscription.canceled' (uma L — grafia americana do Pagar.me)
      // - Falha: 'charge.payment_failed' / 'invoice.payment_failed'
      if (event.type === 'charge.paid' || event.type === 'invoice.paid') {
        if (subscriptionRef) type = 'subscription.activated'
      }
      // Note: webhook handler converts 'activated' to 'renewed' for already-active subscriptions
      if (event.type === 'subscription.canceled') type = 'subscription.cancelled'
      // ACHADO DE VERIFICAÇÃO CONTRA A DOC (2026-08-24): 'charge.refunded' e
      // 'invoice.canceled' existem na lista oficial de eventos e antes
      // caíam em 'unknown' — uma assinatura estornada ou com a fatura
      // cancelada ficava presa em 'active' para sempre, sem nenhum sinal
      // chegar até aqui. Mapeados para 'payment.failed' (o handler marca
      // past_due e só derruba o plano se o período pago já tiver acabado —
      // o mesmo tratamento conservador já usado para uma cobrança recusada).
      if (
        event.type === 'charge.payment_failed' ||
        event.type === 'invoice.payment_failed' ||
        event.type === 'charge.refunded' ||
        event.type === 'invoice.canceled'
      ) {
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
    },

    // BUG CORRIGIDO (validação do zero, rodada 6): sem este método, toda
    // troca de plano na Pagar.me caía no fallback de cancelar a assinatura
    // antiga e criar uma nova — cobrando o preço cheio na hora, mesmo em
    // DOWNGRADE (contradizendo o FAQ de /planos). A Pagar.me v5 documenta
    // PATCH /core/v5/subscriptions/{id}/items/{item_id} pra atualizar o
    // pricing_scheme de um item de assinatura já existente, sem gerar
    // cobrança imediata — só muda o valor cobrado no PRÓXIMO ciclo. Como a
    // Pagar.me não tem conceito de proração exposto aqui, `prorate` é
    // ignorado de propósito (igual MP/Asaas) — checkout/route.ts só usa este
    // caminho pra DOWNGRADE nesta gateway.
    //
    // ⚠️ NÃO TESTADO AO VIVO: as credenciais de Pagar.me configuradas neste
    // ambiente são inválidas/placeholder (achado conhecido, não é bug deste
    // método) — não foi possível confirmar contra a API real que o corpo/
    // resposta têm exatamente este formato. Validar contra o sandbox real da
    // Pagar.me antes de confiar cegamente neste caminho em produção.
    async updateSubscriptionPlan(gatewaySubscriptionId, plan) {
      const getRes = await fetch(`https://api.pagar.me/core/v5/subscriptions/${gatewaySubscriptionId}`, {
        headers: { 'Authorization': basicAuth },
      })
      if (!getRes.ok) {
        throw new Error(`Pagar.me erro ao buscar assinatura: ${await getRes.text()}`)
      }
      const existingSub = await getRes.json()
      const itemId = existingSub.items?.[0]?.id
      if (!itemId) {
        throw new Error('Pagar.me: assinatura existente sem item — não é possível trocar o preço.')
      }

      const patchRes = await fetch(`https://api.pagar.me/core/v5/subscriptions/${gatewaySubscriptionId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Authorization': basicAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: plan.name,
          quantity: 1,
          pricing_scheme: { price: Math.round(plan.price * 100) },
        }),
      })
      if (!patchRes.ok) {
        throw new Error(`Pagar.me erro ao trocar plano da assinatura: ${await patchRes.text()}`)
      }
      const updated = await patchRes.json()
      return {
        gatewaySubscriptionId: updated.subscription_id || gatewaySubscriptionId,
        currentPeriodEnd: existingSub.next_billing_at ? new Date(existingSub.next_billing_at).toISOString() : undefined,
      }
    }
  }
}
