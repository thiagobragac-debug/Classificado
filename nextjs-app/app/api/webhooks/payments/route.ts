import { processPaymentWebhook } from '@/lib/gateways/webhook-handler'

// Rota genérica: identifica o gateway por header (x-gateway/x-source) ou
// `?gateway=` na URL. Usada por Stripe/Mercado Pago/Asaas — ver
// lib/gateways/webhook-handler.ts pro motivo da Pagar.me ter rota própria
// em vez de continuar aqui.
export async function POST(req: Request) {
  return processPaymentWebhook(req)
}
