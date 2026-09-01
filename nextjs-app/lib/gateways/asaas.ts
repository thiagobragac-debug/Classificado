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
    // BUG CORRIGIDO (achado ao vivo, revalidação pós-correções, 2026-09-01):
    // esta busca não tinha ordenação explícita — em uso normal
    // findOrCreateCustomer é idempotente e só existe 1 customer por
    // externalReference, então não importava. Mas se um POST /customers
    // anterior tiver tido sucesso do lado da Asaas e a resposta se perdido
    // por timeout/erro de rede antes do app processar (retry subsequente
    // cria um SEGUNDO customer com o MESMO externalReference), qual dos
    // dois volta primeiro passa a depender da ordenação padrão não
    // documentada da API — reproduzido ao vivo: o mais novo voltou primeiro
    // e não tinha o token de cartão que tokenizeCard já tinha amarrado ao
    // mais antigo, fazendo o checkout falhar com "CreditCardToken não
    // encontrado" de forma não-determinística. `&sort=dateCreated&order=asc`
    // fixa a escolha no MAIS ANTIGO sempre — não elimina a duplicidade em si
    // (isso exigiria um índice de unicidade do lado da Asaas, fora do nosso
    // controle), mas garante que tokenizeCard e createSubscription/
    // updateSubscriptionPlan, cada um com sua própria chamada a esta
    // função, sempre concordem em QUAL dos dois usar.
    const findByRefRes = await fetch(`${baseUrl}/customers?externalReference=${encodeURIComponent(user.id)}&limit=1&sort=dateCreated&order=asc`, { headers })
    if (findByRefRes.ok) {
      const findByRefData = await findByRefRes.json()
      const found = findByRefData.data?.[0]?.id
      if (found) return found
    }

    // BUG CORRIGIDO (achado ao vivo, teste de estresse completo, 2026-09-01):
    // reaproveitar o customer achado por CPF sem checar o dono deixava dois
    // usuários de APP diferentes (CPF digitado errado, CPF de terceiro, ou
    // simples coincidência) serem mesclados silenciosamente no MESMO
    // customer da Asaas — histórico de cobrança e token de cartão
    // tokenizado passavam a ser compartilhados entre contas sem relação
    // nenhuma. Reproduzido ao vivo: 4+ usuários de app com UUIDs/e-mails
    // totalmente distintos caindo no mesmo customer só por reusarem o
    // mesmo CPF de teste. Só reaproveita o customer achado por CPF se ele
    // não tiver dono (externalReference vazio — cliente legado, criado
    // antes desta correção existir) OU se o dono já for o PRÓPRIO usuário
    // atual (mesmo user.id — não achou na 1ª busca por algum motivo
    // transitório, ex. índice não propagado ainda). Fora isso, cria um
    // customer NOVO pra este usuário — aceita ter 2 registros de customer
    // pra um mesmo CPF real na Asaas (inofensivo, a Asaas permite CPF
    // duplicado por design), o que é bem menos grave que misturar a
    // identidade de cobrança de duas contas de app diferentes.
    const findByDocRes = await fetch(`${baseUrl}/customers?cpfCnpj=${docClean}&limit=1`, { headers })
    if (findByDocRes.ok) {
      const findByDocData = await findByDocRes.json()
      const foundCustomer = findByDocData.data?.[0]
      if (foundCustomer && (!foundCustomer.externalReference || foundCustomer.externalReference === user.id)) {
        return foundCustomer.id
      }
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

      const gatewaySubscriptionId = event.payment?.subscription || event.subscription?.id

      // MITIGAÇÃO (achado ao vivo, teste de estresse completo, 2026-09-01):
      // a Asaas só oferece um token estático pra autenticar webhook —
      // confirmado na documentação pública deles, sem HMAC sobre o corpo e
      // sem proteção de timestamp/replay (bem diferente de Stripe/Mercado
      // Pago, que assinam o payload). Isso significa que qualquer requisição
      // que conheça o token consegue enviar QUALQUER payload de evento pra
      // QUALQUER subscription_id, mesmo de outro usuário — demonstrado ao
      // vivo nesta mesma sessão (um evento SUBSCRIPTION_DELETED forjado
      // cancelou de verdade a assinatura de um usuário sem relação nenhuma
      // com quem enviou a requisição).
      //
      // TENTATIVA 1 (revertida): rejeitar o evento (throw) se uma conferência
      // de volta na API real da Asaas não corroborasse o que o evento
      // afirma. Quebrou ativações/cancelamentos LEGÍTIMOS, confirmado ao
      // vivo, reproduzido várias vezes: a API de LEITURA da Asaas fica
      // sistematicamente atrasada em relação ao webhook — meça-se ao vivo
      // um atraso real de propagação que variou de ~3s a mais de 90s pro
      // MESMO tipo de evento, sem padrão previsível. Bloquear a resposta do
      // webhook por tempo suficiente pra cobrir essa cauda (dezenas de
      // segundos, possivelmente mais) não é viável — a maioria dos gateways
      // de pagamento tem timeout de entrega bem mais curto que isso, e ficar
      // rejeitando eventos genuínos é estritamente PIOR que a lacuna
      // original (transforma um risco teórico raro numa falha real e
      // recorrente pra clientes pagantes de verdade).
      //
      // DESENHO ATUAL: detecta sem bloquear. Faz uma conferência com
      // orçamento CURTO (poucos segundos, não trava a resposta por muito
      // tempo) — se corroborar, ótimo, segue normal. Se não corroborar
      // dentro desse orçamento curto, NÃO REJEITA (fail-open, de propósito):
      // processa o evento normalmente do mesmo jeito que sempre processou
      // (sem esta mitigação), mas grava um log de alerta bem visível pra
      // investigação manual/alerta externo. Isso preserva 100% da
      // confiabilidade pro cliente legítimo (o caso comum, que é a maioria
      // esmagadora) enquanto ainda dá um sinal de auditoria pro caso raro de
      // um evento genuinamente forjado ser processado — que hoje, sem
      // NENHUMA mitigação, passaria batido em silêncio total.
      const confirmarSemBloquear = async (
        url: string,
        corrobora: (dados: any) => boolean,
        tentativas = 3,
        atrasoMs = 1200
      ): Promise<{ corroborado: boolean; dados: any }> => {
        let ultimoDados: any = null
        for (let i = 0; i < tentativas; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, atrasoMs))
          const res = await fetch(url, { headers })
          if (res.ok) {
            ultimoDados = await res.json()
            if (corrobora(ultimoDados)) return { corroborado: true, dados: ultimoDados }
          }
        }
        return { corroborado: false, dados: ultimoDados }
      }

      if (type === 'subscription.activated' && event.payment?.id) {
        const { corroborado, dados: payData } = await confirmarSemBloquear(
          `${baseUrl}/payments/${event.payment.id}`,
          (d) => d.status === 'CONFIRMED' || d.status === 'RECEIVED'
        )
        if (!corroborado) {
          console.error(
            `[Asaas Webhook] ALERTA DE AUDITORIA: evento de ativação/renovação (payment.id=${event.payment.id}, subscription=${gatewaySubscriptionId}) não foi corroborado pela API real da Asaas dentro do orçamento curto de conferência — pode ser só atraso normal de propagação (comum, já medido ao vivo) ou, mais raramente, um evento forjado. Processando normalmente mesmo assim (fail-open, ver comentário acima) — revisar manualmente se houver suspeita concreta.`,
            payData ? { statusEncontrado: payData.status } : { motivo: 'pagamento não encontrado na API' }
          )
        }
      }

      if (type === 'subscription.cancelled' && gatewaySubscriptionId) {
        const { corroborado, dados: subData } = await confirmarSemBloquear(
          `${baseUrl}/subscriptions/${gatewaySubscriptionId}`,
          (d) => d.deleted === true || d.status !== 'ACTIVE'
        )
        if (!corroborado) {
          console.error(
            `[Asaas Webhook] ALERTA DE AUDITORIA: evento de cancelamento (subscription=${gatewaySubscriptionId}) não foi corroborado pela API real da Asaas dentro do orçamento curto de conferência — pode ser só atraso normal de propagação ou, mais raramente, um evento forjado. Processando normalmente mesmo assim (fail-open, ver comentário acima) — revisar manualmente se houver suspeita concreta.`,
            subData ? { statusEncontrado: subData.status, deleted: subData.deleted } : { motivo: 'assinatura não encontrada na API' }
          )
        }
      }

      return {
        type,
        eventId: event.id,
        gatewaySubscriptionId,
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
      // Mesma correção idempotente aplicada nos 4 adapters (achado ao vivo,
      // 2026-09-01, ver comentário equivalente em stripe.ts): se o gateway já
      // não tem essa assinatura, o objetivo (parar de cobrar) já está
      // cumprido — trata 404 como sucesso em vez de travar o cancelamento.
      if (!response.ok && response.status !== 404) {
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
      // BUG CORRIGIDO (achado ao vivo, teste de estresse completo, 2026-09-01):
      // `new Date("YYYY-MM-DDT00:00:00")` sem offset é interpretado no
      // timezone LOCAL DO PROCESSO Node, não em Brasília — só dava o
      // resultado certo porque a máquina de dev roda em America/Sao_Paulo.
      // Num deploy com TZ=UTC (comum em host cloud, inclusive Vercel), a
      // mesma linha gravaria current_period_end/plan_expires_at 3h mais
      // cedo (meia-noite em Brasília = 03:00 UTC). Todas as datas que a
      // Asaas devolve (nextDueDate, dueDate) são calendário brasileiro —
      // fixa o offset explícito, mesmo padrão já usado em
      // app/(admin)/admin/cupons/page.tsx pra valid_until.
      let currentPeriodEnd = updated.nextDueDate ? new Date(`${updated.nextDueDate}T00:00:00-03:00`).toISOString() : undefined
      try {
        const paymentsRes = await fetch(`${baseUrl}/payments?subscription=${gatewaySubscriptionId}&status=PENDING&limit=1`, { headers })
        if (paymentsRes.ok) {
          const paymentsData = await paymentsRes.json()
          const pendingDueDate = paymentsData?.data?.[0]?.dueDate
          if (pendingDueDate) {
            currentPeriodEnd = new Date(`${pendingDueDate}T00:00:00-03:00`).toISOString()
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
