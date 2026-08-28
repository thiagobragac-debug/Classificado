import { BillingAddress, CreditCardData, GatewayAdapter, GatewayUser, WebhookEvent } from './types'
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

  // Buscar cliente existente antes de criar.
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
  //
  // Compartilhada entre createSubscription e tokenizeCard: o token de cartão
  // da Asaas é amarrado a um customer ("armazenado por cliente, não pode ser
  // usado em transações de outros clientes"), então os dois fluxos precisam
  // resolver para o MESMO customerId de um mesmo usuário.
  async function findOrCreateCustomer(user: GatewayUser, docClean: string): Promise<string> {
    const findByRefRes = await fetch(`${baseUrl}/customers?externalReference=${encodeURIComponent(user.id)}&limit=1`, { headers })
    if (findByRefRes.ok) {
      const findByRefData = await findByRefRes.json()
      const found = findByRefData.data?.[0]?.id
      if (found) return found
    }

    const findByDocRes = await fetch(`${baseUrl}/customers?cpfCnpj=${docClean}&limit=1`, { headers })
    if (findByDocRes.ok) {
      const findByDocData = await findByDocRes.json()
      const found = findByDocData.data?.[0]?.id
      if (found) return found
    }

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
    return customerData.id
  }

  return {
    name: 'asaas',

    // Isola a ÚNICA chamada em que dado de cartão em claro passa pelo nosso
    // servidor (ver comentário em GatewayAdapter.tokenizeCard, types.ts). O
    // token devolvido pela Asaas substitui creditCard+creditCardHolderInfo
    // inteiros na criação da assinatura (abaixo) — nada disso é persistido
    // aqui, só repassado.
    async tokenizeCard(user, creditCard, billingAddress, doc, phone, ip) {
      const docClean = doc.replace(/\D/g, '')
      if (docClean.length !== 11 && docClean.length !== 14) {
        throw new Error('Asaas: CPF/CNPJ inválido para o cliente.')
      }

      const customerId = await findOrCreateCustomer(user, docClean)

      let phoneClean = (phone || '11999999999').replace(/\D/g, '')
      if (phoneClean.length === 10) phoneClean = phoneClean.slice(0, 2) + '9' + phoneClean.slice(2)
      if (phoneClean.length < 10) phoneClean = '11999999999'

      const tokenRes = await fetch(`${baseUrl}/creditCard/tokenizeCreditCard`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer: customerId,
          creditCard: {
            holderName: creditCard.holderName,
            number: creditCard.number,
            expiryMonth: creditCard.expMonth,
            expiryYear: creditCard.expYear,
            ccv: creditCard.cvv,
          },
          creditCardHolderInfo: {
            name: user.name || creditCard.holderName,
            email: user.email,
            cpfCnpj: docClean,
            postalCode: billingAddress.cep.replace(/\D/g, ''),
            addressNumber: billingAddress.number,
            phone: phoneClean,
          },
          remoteIp: ip,
        }),
      })
      if (!tokenRes.ok) {
        throw new Error(`Asaas erro na tokenização: ${await tokenRes.text()}`)
      }
      const tokenData = await tokenRes.json()
      return tokenData.creditCardToken
    },

    async createSubscription(plan, user, paymentData, subscriptionId) {
      if (paymentData.method !== 'card') {
        throw new Error('Asaas: Checkout transparente requer cartão de crédito, CPF/CNPJ e endereço de cobrança.')
      }
      if (!paymentData.gatewayToken && (!paymentData.creditCard || !paymentData.billingAddress || !paymentData.doc)) {
        throw new Error('Asaas: Checkout transparente requer cartão de crédito, CPF/CNPJ e endereço de cobrança.')
      }
      if (!paymentData.ip) {
        throw new Error('Asaas: IP do cliente é obrigatório (remoteIp).')
      }

      // Resolve o customer em ambos os caminhos. No caminho com token, o
      // tokenizeCard acima já resolveu (achou ou criou) um customer para este
      // MESMO user.id — a busca por externalReference abaixo encontra esse
      // customer de novo, sem duplicar. Passar docClean='' é seguro aqui: só
      // seria usado se a busca por externalReference falhasse, o que não deve
      // acontecer para um customer que a própria tokenização acabou de tocar.
      const docClean = paymentData.doc ? paymentData.doc.replace(/\D/g, '') : ''
      if (!paymentData.gatewayToken && docClean.length !== 11 && docClean.length !== 14) {
        throw new Error('Asaas: CPF/CNPJ inválido para o cliente.')
      }
      const customerId = await findOrCreateCustomer(user, docClean)

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

      // creditCardToken substitui creditCard+creditCardHolderInfo por completo
      // (confirmado na doc: "se sua integração já usa tokenização, é
      // recomendado informar apenas o creditCardToken, sem reenviar os dados
      // completos do cartão") — remoteIp continua obrigatório nos dois casos.
      const cardFields = paymentData.gatewayToken
        ? { creditCardToken: paymentData.gatewayToken }
        : {
            creditCard: {
              holderName: paymentData.creditCard!.holderName,
              number: paymentData.creditCard!.number,
              expiryMonth: paymentData.creditCard!.expMonth,
              expiryYear: paymentData.creditCard!.expYear,
              ccv: paymentData.creditCard!.cvv
            },
            creditCardHolderInfo: {
              name: user.name || paymentData.creditCard!.holderName,
              email: user.email,
              cpfCnpj: docClean,
              postalCode: paymentData.billingAddress!.cep.replace(/\D/g, ''),
              addressNumber: paymentData.billingAddress!.number,
              phone: phoneClean
            }
          }

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
          ...cardFields,
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
    },

    // BUG CORRIGIDO (validação do zero, rodada 6): antes deste método não
    // existir, TODA troca de plano na Asaas caía no fallback de
    // app/api/checkout/route.ts (cancela a antiga, cria uma nova, cobrando o
    // preço cheio na hora) — inclusive em DOWNGRADE, contradizendo a
    // promessa do FAQ de /planos ("downgrade só muda no próximo ciclo, nada
    // é cobrado agora"). A Asaas documenta PUT /v3/subscriptions/{id} pra
    // atualizar `value`/`cycle`/`description` de uma assinatura já
    // existente — isso NÃO gera cobrança imediata, só muda o valor da
    // PRÓXIMA fatura (a data de vencimento em curso não é alterada). Como a
    // Asaas não tem conceito de proração, não dá pra cobrar a diferença de
    // upgrade na hora como a Stripe faz — o parâmetro `prorate` é ignorado
    // aqui de propósito (ver a condição em checkout/route.ts que só chama
    // este caminho pra DOWNGRADE nesta gateway, mantendo upgrade no fallback
    // de cancelar+recriar, que já cobra na hora).
    async updateSubscriptionPlan(gatewaySubscriptionId, plan) {
      const cycle = plan.billingCycle === 'annual' ? 'YEARLY' : 'MONTHLY'
      const response = await fetch(`${baseUrl}/subscriptions/${gatewaySubscriptionId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          value: plan.price,
          cycle,
          description: plan.name,
        }),
      })
      if (!response.ok) {
        throw new Error(`Asaas erro ao trocar plano da assinatura: ${await response.text()}`)
      }
      const updated = await response.json()

      // BUG CORRIGIDO (retomada da verificação independente, 2ª rodada de
      // revisão adversarial, confirmado ao vivo 2x no sandbox real): o
      // `nextDueDate` retornado pela própria assinatura está sistematicamente
      // UM CICLO DE COBRANÇA À FRENTE da fatura que de fato está pendente e
      // "governando" o período atual — não muda mesmo enquanto essa fatura
      // continua pendente, e nem quando ela é paga. Usar `nextDueDate` direto
      // como currentPeriodEnd faz plan_expires_at/current_period_end ficarem
      // um ciclo além do vencimento real; se a fatura de downgrade (preço
      // antigo) não for paga, o webhook de PAYMENT_OVERDUE compara contra
      // esse valor inflado e não rebaixa o acesso na hora certa — o cliente
      // fica com acesso pago por um ciclo inteiro extra sem pagar. Busca a
      // fatura PENDING de verdade desta assinatura e usa o `dueDate` dela;
      // só cai pro `nextDueDate` da assinatura (comportamento antigo) se por
      // algum motivo não houver nenhuma fatura pendente encontrada.
      let currentPeriodEnd = updated.nextDueDate ? new Date(`${updated.nextDueDate}T00:00:00`).toISOString() : undefined
      try {
        const paymentsRes = await fetch(`${baseUrl}/payments?subscription=${gatewaySubscriptionId}&status=PENDING&limit=1`, { headers })
        if (paymentsRes.ok) {
          const paymentsData = await paymentsRes.json()
          const pendingDueDate = paymentsData?.data?.[0]?.dueDate
          if (pendingDueDate) {
            currentPeriodEnd = new Date(`${pendingDueDate}T00:00:00`).toISOString()
          }
        }
      } catch {
        // Falha ao buscar a fatura pendente não deve quebrar a troca de
        // plano em si (já confirmada com sucesso acima) — segue com o
        // fallback (nextDueDate da assinatura) já calculado.
      }

      return {
        gatewaySubscriptionId: updated.id,
        currentPeriodEnd,
      }
    }
  }
}
