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
      // public_key) substitui os dados crus do cartão.
      //
      // BUG CORRIGIDO (achado ao vivo contra o sandbox real, 2026-09-02):
      // a doc do objeto "credit_card" (usado em pedidos/orders) diz que
      // card_token é propriedade direta, não aninhada — mas em
      // /subscriptions isso só vale pela metade. Testado empiricamente
      // (4 variações, cartão de teste "sucesso total" da Pagar.me
      // 4000000000000010):
      //   - card_token aninhado em `card` (como antes) -> 422, a API
      //     tenta validar `card` como se fossem dados crus e ignora
      //     card_token silenciosamente.
      //   - card_token no nível raiz SEM billing_address em `card` -> a
      //     assinatura é criada (200) mas a 1ª cobrança falha com
      //     "billing | value is required" (o adquirente exige endereço
      //     de cobrança do cartão e ele não estava chegando).
      //   - card_token no nível raiz billing_address como irmão (raiz)
      //     -> mesma falha acima.
      //   - card_token no nível raiz + `card: { billing_address }` (SEM
      //     card_token aninhado) -> cobrança "paid", assinatura "active".
      // Ou seja: card_token e billing_address não podem estar no mesmo
      // objeto `card` — card_token vai solto na raiz, billing_address
      // continua dentro de `card`.
      const cardToken = paymentData.gatewayToken
      const card = cardToken
        ? { billing_address: billingAddress }
        : {
            number: paymentData.creditCard!.number,
            holder_name: paymentData.creditCard!.holderName,
            exp_month: parseInt(paymentData.creditCard!.expMonth, 10),
            exp_year: parseInt(paymentData.creditCard!.expYear, 10),
            cvv: paymentData.creditCard!.cvv,
            billing_address: billingAddress
          }

      // BUG CORRIGIDO (achado ao vivo contra o sandbox real, 2026-09-02 —
      // primeira vez que este adapter foi testado com credenciais válidas):
      // billing_type='exact_day' exige billing_day (dia do mês em que a
      // cobrança recorrente acontece) — confirmado pela própria API real
      // ("The billing_day field is required if the billing_type is equal
      // to 'exact_day'"), toda criação de assinatura falhava com 422 sem
      // esse campo. Usa o dia de hoje (assinatura começa e cobra todo mês
      // no mesmo dia) — mesmo padrão de "cobra a partir de hoje" que
      // stripe.ts/asaas.ts já usam.
      const billingDay = new Date().getDate()
      const body = {
        payment_method: 'credit_card',
        interval,
        interval_count: intervalCount,
        billing_type: 'exact_day', // Pagar.me recommended for cc subscriptions
        billing_day: billingDay,
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
        ...(cardToken ? { card_token: cardToken } : {}),
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
      // RESOLVIDO (confirmado ao vivo no painel real da Pagar.me,
      // 2026-09-02 — a rodada de 24/08 tinha varrido só a documentação
      // pública e não achado nada; o mecanismo real só aparece na TELA de
      // cadastro de webhook, atrás de um toggle "Habilitar autenticação",
      // nunca documentado publicamente). Não é HMAC nenhum: é HTTP Basic
      // Auth simples ("Usuário do Webhook" + "Senha do Webhook" na UI deles)
      // — a Pagar.me manda `Authorization: Basic base64(usuario:senha)` na
      // notificação. `pagarme_webhook_secret` agora guarda os dois valores
      // juntos no formato `usuario:senha` (mesmo texto que se cola direto
      // da UI deles, sem transformação).
      if (!secret || !secret.includes(':')) {
        throw new Error('Pagar.me webhook secret not configured (esperado usuario:senha). Rejecting webhook.')
      }

      const authHeader = headers['authorization']
      if (!authHeader) throw new Error('Missing Pagar.me Authorization header')

      const expectedAuth = `Basic ${Buffer.from(secret, 'utf8').toString('base64')}`
      if (!assinaturaConfere(expectedAuth, authHeader)) {
        throw new Error('Invalid Pagar.me webhook credentials')
      }

      const event = JSON.parse(body)
      let type: WebhookEvent['type'] = 'unknown'
      const dataObj = event.data || {}

      // LOG TEMPORÁRIO DE DIAGNÓSTICO (2026-09-02): 6 webhooks reais
      // chegaram num teste ao vivo contra produção e todos caíram em
      // 'unknown' — precisa ver o event.type CRU que a Pagar.me manda de
      // verdade antes de ajustar o mapeamento abaixo (que hoje assume só
      // charge.paid/invoice.paid/subscription.canceled/*.payment_failed,
      // baseado só na doc pública). Remover depois de confirmar.
      console.info('[Webhook:pagarme] evento cru recebido:', event.type, '| tem subscriptionRef?', !!(dataObj.subscription || dataObj.invoice?.subscription))

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

      // Mesma correção idempotente aplicada nos 4 adapters (achado ao vivo,
      // 2026-09-01, ver comentário equivalente em stripe.ts): se o gateway já
      // não tem essa assinatura, o objetivo (parar de cobrar) já está
      // cumprido.
      //
      // BUG CORRIGIDO (primeiro teste ao vivo real deste adapter contra o
      // sandbox, 2026-09-02): ao contrário dos outros 3 gateways (que
      // respondem 404 pra "assinatura já não existe"), a Pagar.me responde
      // **412 Precondition Failed** com {"message":"This subscription is
      // canceled."} quando a assinatura já está cancelada — reproduzido ao
      // vivo cancelando a mesma assinatura de teste 2x seguidas. O check só
      // com 404 (copiado dos outros adapters sem validar contra a API real
      // desta) nunca teria pego esse caso — reativação de assinatura
      // (admin, flip de status local) travaria aqui exatamente como o bug
      // original (já corrigido nos outros 3) descrevia.
      if (!response.ok && response.status !== 404 && response.status !== 412) {
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

      // BUG CORRIGIDO (primeiro teste ao vivo real deste adapter contra o
      // sandbox, 2026-09-02): faltava `status` no corpo — confirmado pela
      // própria API real ("The status field is required"), toda troca de
      // plano falhava com 422. Mantém o item ativo (não é uma pausa/
      // cancelamento de item, só troca de preço/descrição).
      const patchRes = await fetch(`https://api.pagar.me/core/v5/subscriptions/${gatewaySubscriptionId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Authorization': basicAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: plan.name,
          quantity: 1,
          status: 'active',
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
