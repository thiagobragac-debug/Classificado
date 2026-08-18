export * from './types'
export { stripeAdapter } from './stripe'
export { mercadoPagoAdapter } from './mercadopago'
export { pagarmeAdapter } from './pagarme'
export { asaasAdapter } from './asaas'

import { GatewayName } from './types'

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
