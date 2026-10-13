export type GatewayName = 'stripe' | 'mercadopago' | 'pagarme' | 'asaas'
export type BillingCycle = 'monthly' | 'annual'

// Recusa DEFINITIVA do gateway: a resposta chegou (HTTP 4xx, ou HTTP 200 com
// a 1ª cobrança 'failed'/'incomplete'). Diferente de uma falha AMBÍGUA (rede
// caiu, timeout, 5xx), em que o gateway pode ter cobrado e perdido a
// resposta. A distinção importa pra idempotência: as chaves dos gateways são
// estáveis por checkoutId (uma retentativa ambígua devolve a assinatura já
// criada em vez de cobrar de novo), mas depois de uma recusa definitiva o
// mesmo checkoutId devolveria a recusa em cache -- por isso a rota responde
// 402 e o modal gera um checkoutId NOVO antes da próxima tentativa.
export class GatewayDeclinedError extends Error {
  readonly declined = true
  constructor(message: string) {
    super(message)
    this.name = 'GatewayDeclinedError'
  }
}

// F46 (auditoria 12/out/2026): "todo 4xx é recusa definitiva do cartão" era largo
// demais. 401/403 (credencial inválida/sem permissão), 404 (recurso inexistente),
// 408 (timeout), 409 (conflito/idempotência em andamento -- ambíguo: a 1ª tentativa
// ainda pode concluir) e 429 (rate limit) NÃO dizem nada sobre o cartão: tratá-los
// como recusa mostrava "pagamento recusado" ao cliente por culpa nossa (chave
// errada) e rotacionava o checkoutId no meio de uma tentativa possivelmente ainda
// em curso. Esses viram erro AMBÍGUO (502, mesmo checkoutId, linha mantida).
const STATUS_4XX_NAO_DEFINITIVOS = new Set([401, 403, 404, 408, 409, 429])
export function recusadoPeloGateway(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 && !STATUS_4XX_NAO_DEFINITIVOS.has(httpStatus)
}

export interface GatewayPlan {
  id: string
  name: string
  price: number // monthly price, in `currency`
  billingCycle: BillingCycle
  // ISO 4217, ex. 'BRL'/'USD'. Só a Stripe usa isto de verdade hoje (ver
  // lib/gateways/stripe.ts) — os demais adapters continuam fixos em BRL.
  // Ausente/undefined = 'BRL' (comportamento anterior a esta option).
  currency?: string
}

export interface GatewayUser {
  id: string
  email: string
  name?: string
  country?: string // ISO 2-letter code
}

export interface CreateSubscriptionResult {
  checkoutUrl: string
  gatewaySubscriptionId?: string
  gatewayCustomerId?: string
  sessionId?: string
}

export interface WebhookEvent {
  type: 'subscription.activated' | 'subscription.renewed' | 'subscription.cancelled' | 'subscription.plan_changed' | 'payment.failed' | 'unknown'
  eventId: string // Unique event ID to prevent duplicate webhook processing
  gatewaySubscriptionId: string
  gatewayCustomerId?: string
  userEmail?: string
  externalReference?: string // our internal user_id or subscription_id
  periodEnd?: string // ISO date
  // Metadata carregado da assinatura no momento do evento (ex.: plan_id) —
  // 'subscription.plan_changed' usa isto pra saber pra qual plano aplicar
  // o entitlement, sem depender de casar por nome.
  metadata?: Record<string, any>
  // billing_reason da invoice (Stripe: subscription_create/subscription_cycle/
  // subscription_update/...) — usado por 'payment.failed' pra não tratar uma
  // fatura de proração recusada (troca de plano) como se fosse a assinatura
  // regular do cliente que falhou.
  billingReason?: string
  // Timestamp Unix (segundos) do evento na origem — usado por
  // 'subscription.plan_changed' pra descartar eventos entregues fora de
  // ordem (a Stripe não garante ordem de entrega de webhook).
  eventCreatedAt?: number
  // Identidade do PAGAMENTO (fatura/cobrança) que este evento confirma, igual
  // para todos os eventos que descrevem o mesmo pagamento (F02/F03 da auditoria
  // de 12/out/2026): Pagar.me manda charge.paid E invoice.paid da mesma fatura,
  // Asaas manda PAYMENT_CONFIRMED E PAYMENT_RECEIVED, MP manda payment.created
  // e payment.updated. Cada evento tem event id próprio (a idempotência por
  // eventId não os junta), então sem isto cada um estendia o período de novo.
  // O handler estende o período no máximo UMA vez por paymentId.
  paymentId?: string
  // true quando o evento NÃO é um pagamento (ex.: Mercado Pago preapproval
  // 'authorized', que também dispara quando o PRÓPRIO reajuste/troca de plano
  // altera a assinatura): serve para ATIVAR uma assinatura pendente, nunca para
  // estender o período de uma já ativa.
  activationSignalOnly?: boolean
  raw: any
}

export interface BillingAddress {
  cep: string
  street: string
  number: string
  neighborhood: string
  city: string
  state: string
}

export interface CreditCardData {
  number: string
  holderName: string
  expMonth: string
  expYear: string
  cvv: string
}

export interface PaymentData {
  method: 'card' | 'pix' | 'boleto'
  creditCard?: CreditCardData;
  billingAddress?: BillingAddress;
  gatewayToken?: string;
  doc?: string;
  phone?: string
  // IP do cliente que está pagando — a Asaas marca `remoteIp` como campo
  // obrigatório na criação de assinatura por cartão. Populado em
  // app/api/checkout/route.ts via lib/ip-utils.ts; os demais gateways ignoram.
  ip?: string
}

export interface GatewayAdapter {
  name: GatewayName
  createSubscription(
    plan: GatewayPlan,
    user: GatewayUser,
    paymentData: PaymentData,
    subscriptionId: string
  ): Promise<CreateSubscriptionResult>
  validateWebhook(body: string, headers: Record<string, string>, secret: string): Promise<WebhookEvent>
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>
  // Só a Asaas implementa: a tokenização dela (POST /creditCard/tokenizeCreditCard)
  // exige a access_token secreta no header, então não pode ser chamada do
  // navegador como a da Stripe/Mercado Pago/Pagar.me (essas usam chave pública e
  // tokenizam direto no cliente). Esta função existe para isolar a ÚNICA janela
  // em que dado de cartão em claro precisa passar pelo nosso servidor: recebe o
  // cartão, chama a Asaas, devolve o creditCardToken, e não persiste nada — ver
  // app/api/checkout/tokenize-card/route.ts.
  tokenizeCard?(
    user: GatewayUser,
    creditCard: CreditCardData,
    billingAddress: BillingAddress,
    doc: string,
    phone: string | undefined,
    ip: string
  ): Promise<string>
  // Só a Stripe implementa: troca o preço de uma assinatura JÁ EXISTENTE
  // (em vez de criar uma nova) via items[].price_data na mesma chamada de
  // update, usando o suporte nativo de proration da própria Stripe.
  // `prorate=true` (upgrade) cobra a diferença proporcional agora
  // (proration_behavior=always_invoice); `prorate=false` (downgrade) só
  // aplica o preço novo na próxima fatura, sem cobrar nem creditar nada
  // agora (proration_behavior=none) — exatamente as duas promessas do FAQ
  // de /planos ("upgrade cobra pro-rata"/"downgrade muda no próximo
  // ciclo"). Os demais gateways não têm essa API pronta — teriam que
  // simular na mão, então não implementam este método; o checkout cai de
  // volta no caminho de cancelar a antiga e criar uma nova.
  // BUG CORRIGIDO (validação de 2026-08-26): as chaves de idempotência
  // originais eram determinísticas só em (subscriptionId, plan.id,
  // prorate) — repetir uma combinação já usada antes na mesma assinatura
  // (ex.: PRO→Premium→PRO de novo no mesmo dia) fazia a Stripe devolver a
  // resposta antiga em cache, sem aplicar a troca real, enquanto o banco
  // gravava sucesso. `idempotencyNonce` precisa ser único por TENTATIVA
  // de troca (não por combinação de plano) — o checkoutId que o
  // CheckoutModal já gera por abertura do modal serve exatamente pra
  // isso: mesmo valor num duplo-clique acidental (dedupe correto),
  // valor novo numa tentativa genuinamente nova.
  updateSubscriptionPlan?(
    gatewaySubscriptionId: string,
    plan: GatewayPlan,
    prorate: boolean,
    idempotencyNonce: string
  ): Promise<{ gatewaySubscriptionId: string; currentPeriodEnd?: string }>

  // F13/F04 (auditoria 12/out/2026): lê no gateway o valor RECORRENTE vigente da
  // assinatura (na unidade principal: reais/dólares, não centavos). Usado pelo
  // reajuste da promoção para CONFERIR o efeito do PUT em vez de confiar só no HTTP
  // 200 -- um PUT aceito mas sem efeito deixava o banco dizendo "reajustado"
  // enquanto o cliente seguia pagando 50%. null = não foi possível ler (não
  // bloqueia o reajuste; só a divergência CONFIRMADA o faz).
  getSubscriptionPrice?(gatewaySubscriptionId: string): Promise<number | null>
}
