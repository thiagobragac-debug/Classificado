export type GatewayName = 'stripe' | 'mercadopago' | 'pagarme' | 'asaas'
export type BillingCycle = 'monthly' | 'annual'

export interface GatewayPlan {
  id: string
  name: string
  price: number // monthly price in BRL
  billingCycle: BillingCycle
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
  type: 'subscription.activated' | 'subscription.renewed' | 'subscription.cancelled' | 'payment.failed' | 'unknown'
  eventId: string // Unique event ID to prevent duplicate webhook processing
  gatewaySubscriptionId: string
  gatewayCustomerId?: string
  userEmail?: string
  externalReference?: string // our internal user_id or subscription_id
  periodEnd?: string // ISO date
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
  ): Promise<{ gatewaySubscriptionId: string }>
}
