import { processPaymentWebhook } from '@/lib/gateways/webhook-handler'

// BUG CRÍTICO CORRIGIDO (achado ao vivo, 2026-09-02): a rota genérica
// (../route.ts) identifica o gateway por header ou por `?gateway=` na URL
// — mas a Pagar.me não manda header próprio, e confirmado por log real que
// ela REMOVE a query string da URL antes de chamar o webhook (mesmo com a
// URL salva certinho no painel deles, com `?gateway=pagarme` no final, o
// request que chega aqui nunca tem query string nenhuma). Sem outra forma
// de identificação disponível do lado deles, esta rota dedicada já sabe
// seu gateway de propósito — a URL a cadastrar no painel da Pagar.me é só
// esta, sem query string nenhuma:
//   https://www.tauzeclass.com.br/api/webhooks/payments/pagarme
export async function POST(req: Request) {
  return processPaymentWebhook(req, 'pagarme')
}
