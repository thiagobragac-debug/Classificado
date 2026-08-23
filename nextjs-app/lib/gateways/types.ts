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
}
