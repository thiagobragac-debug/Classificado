export * from './types'
export { stripeAdapter } from './stripe'
export { mercadoPagoAdapter } from './mercadopago'
export { pagarmeAdapter } from './pagarme'
export { asaasAdapter } from './asaas'

import { GatewayName } from './types'
import { stripeAdapter } from './stripe'
import { mercadoPagoAdapter } from './mercadopago'
import { pagarmeAdapter } from './pagarme'
import { asaasAdapter } from './asaas'

// Compartilhado entre /api/checkout/init (só PREVÊ, pra decidir se o
// CheckoutModal pula a coleta de dados de cobrança/cartão) e /api/checkout
// (decide de fato qual caminho seguir) — exatamente a mesma condição nos
// dois lugares, pra nunca a UI prometer um "pula o formulário" que o
// backend não vai honrar (ou vice-versa).
//
// BUG CORRIGIDO (validação adversarial final): esta lista era um array
// hardcoded mantido manualmente em paralelo à checagem REAL em
// checkout/route.ts (`&& adapter.updateSubscriptionPlan`) — inofensivo hoje
// porque os 4 concordam, mas divergiria em silêncio assim que alguém
// adicionasse/removesse o método num adapter sem lembrar de atualizar
// também esta lista. Deriva da checagem real dos 4 adapters — construir um
// adapter é só montar o objeto de métodos (fecha sobre a chave em closure,
// nunca a usa aqui), não faz nenhuma chamada de rede nem exige credencial
// válida.
const GATEWAYS_COM_TROCA_NATIVA: GatewayName[] = (['stripe', 'mercadopago', 'pagarme', 'asaas'] as const)
  .filter((name): name is GatewayName => {
    const adapter =
      name === 'stripe' ? stripeAdapter('') :
      name === 'mercadopago' ? mercadoPagoAdapter('') :
      name === 'pagarme' ? pagarmeAdapter('') :
      asaasAdapter('', 'sandbox')
    return typeof adapter.updateSubscriptionPlan === 'function'
  })

export function isNativePlanSwitchEligible(params: {
  existingSubGateway: string | null | undefined
  existingSubGatewayId: string | null | undefined
  existingSubPrice: number | null | undefined
  targetGatewayName: GatewayName
  finalPrice: number
}): boolean {
  const { existingSubGateway, existingSubGatewayId, existingSubPrice, targetGatewayName, finalPrice } = params
  if (!existingSubGatewayId || !existingSubGateway) return false
  if (existingSubGateway !== targetGatewayName) return false
  if (finalPrice <= 0) return false
  const prorate = finalPrice > Number(existingSubPrice ?? 0)
  const gatewaySuportaTrocaNativa = targetGatewayName === 'stripe' || (!prorate && GATEWAYS_COM_TROCA_NATIVA.includes(targetGatewayName))
  return gatewaySuportaTrocaNativa
}

// Return the correct gateway adapter name based on user country
export function selectGateway(
  userCountry: string | undefined | null,
  nationalDefault: string,
  internationalDefault: string
): GatewayName {
  const isNational = !userCountry || userCountry.toUpperCase() === 'BR' || userCountry.toUpperCase() === 'BRASIL'
  if (isNational) {
    const valid: GatewayName[] = ['stripe', 'mercadopago', 'pagarme', 'asaas']
    return (valid.includes(nationalDefault as GatewayName) ? nationalDefault : 'mercadopago') as GatewayName
  } else {
    // International: only stripe or mercadopago
    const valid: GatewayName[] = ['stripe', 'mercadopago']
    return (valid.includes(internationalDefault as GatewayName) ? internationalDefault : 'stripe') as GatewayName
  }
}
