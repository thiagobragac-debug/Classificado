// Promoção "50% OFF no primeiro ciclo" (pedida ao vivo, 27/set/2026): função
// pura, sem I/O, compartilhada entre app/api/checkout/route.ts e
// app/api/checkout/init/route.ts -- as duas rotas precisam concordar
// EXATAMENTE no preço final (o próprio checkout/init já tem um comentário
// alertando que o modal mostra um valor e o /api/checkout cobra outro se as
// duas contas divergirem).
//
// Regra central: cupom manual e promoção automática NUNCA se somam -- usa
// sempre o MAIOR desconto entre os dois (Math.min dos preços resultantes).
// Empate exato: a promoção vence, de propósito -- ela é reversível por
// design (promo_first_cycle_pending faz o preço voltar ao cheio depois do
// 1o ciclo), enquanto nada aqui nunca reajusta o preço de um cupom, então
// deixar o cupom "vencer" no empate equivaleria a um desconto permanente
// sem essa intenção.

export interface CouponInput {
  discountType: 'percentage' | 'fixed'
  discountValue: number
  discountValueUsd?: number | null
}

export interface FirstCyclePromoInput {
  /** Preço base já com plans.promotional_price e o ajuste anual (×0.8×12) aplicados -- a mesma variável `basePrice` de checkout/route.ts. */
  basePrice: number
  /** platform_settings['promo_primeiro_ciclo_ativo'] === '1', lido pelo chamador. */
  promoAtiva: boolean
  /** plan.name.toLowerCase().includes('pro') || .includes('premium') -- mesmo critério já usado em webhook-handler.ts. */
  planElegivel: boolean
  coupon?: CouponInput | null
  useUsd: boolean
}

export interface FirstCyclePromoResult {
  finalPrice: number
  /** true quando a promoção automática foi o desconto que efetivamente valeu -- dispara promo_first_cycle_pending/promo_full_price na criação da assinatura. */
  promoVenceu: boolean
  /** true quando o cupom (se houver) teve efeito real no preço -- réplica de quando checkout/route.ts:307-340 setava appliedCoupon. Falso pra cupom fixo em USD sem discountValueUsd cadastrado. O chamador só deve consumir o uso do cupom (try_apply_coupon) quando isto for true E promoVenceu for false. */
  cupomTemEfeito: boolean
}

// Réplica exata da lógica de app/api/checkout/route.ts:307-340 (mesmos 3
// ramos: percentual, fixo em USD com equivalente cadastrado, fixo em BRL) --
// só o cálculo de preço, sem os efeitos colaterais de erro de validade (que
// continuam responsabilidade do chamador, pois dependem da consulta ao
// banco pra saber se o cupom existe/está ativo/não expirou/não estourou o
// limite de usos).
function aplicarCupom(basePrice: number, coupon: CouponInput | null | undefined, useUsd: boolean): { preco: number; temEfeito: boolean } {
  if (!coupon) return { preco: basePrice, temEfeito: false }
  if (coupon.discountType === 'percentage') {
    return { preco: Math.max(0, basePrice * (1 - coupon.discountValue / 100)), temEfeito: true }
  }
  if (useUsd) {
    if (coupon.discountValueUsd !== null && coupon.discountValueUsd !== undefined) {
      return { preco: Math.max(0, basePrice - Number(coupon.discountValueUsd)), temEfeito: true }
    }
    return { preco: basePrice, temEfeito: false } // cupom fixo sem equivalente USD cadastrado -- sem efeito, mesmo comportamento de sempre
  }
  return { preco: Math.max(0, basePrice - coupon.discountValue), temEfeito: true }
}

export function calcularPrecoComMaiorDesconto(input: FirstCyclePromoInput): FirstCyclePromoResult {
  const { preco: precoComCupom, temEfeito: cupomTemEfeito } = aplicarCupom(input.basePrice, input.coupon, input.useUsd)
  const promoAplicavel = input.promoAtiva && input.planElegivel
  const precoComPromo = promoAplicavel ? input.basePrice * 0.5 : input.basePrice

  const promoVenceu = promoAplicavel && precoComPromo <= precoComCupom
  const finalPrice = promoVenceu ? precoComPromo : precoComCupom

  // Mesmo arredondamento final de checkout/route.ts:349 (resíduo de ponto
  // flutuante em desconto percentual) -- uma única fonte de verdade agora.
  return { finalPrice: Math.round(finalPrice * 100) / 100, promoVenceu, cupomTemEfeito }
}

export function planElegivelParaPromo(planName: string): boolean {
  const nome = planName.toLowerCase()
  return nome.includes('pro') || nome.includes('premium')
}
