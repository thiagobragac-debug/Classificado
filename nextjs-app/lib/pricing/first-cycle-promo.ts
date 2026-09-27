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
  /** Preço base já com plans.promotional_price (desconto manual permanente, se configurado) e o ajuste anual (×0.8×12) aplicados -- a mesma variável `basePrice` de checkout/route.ts. Cupom continua sendo aplicado sobre ESTE valor (comportamento preservado, pré-existente a esta feature). */
  basePrice: number
  /**
   * BUG CRÍTICO CORRIGIDO (achado por revisão adversarial, 27/set/2026):
   * a promoção automática de 50% estava sendo calculada sobre `basePrice`
   * (que já podia estar reduzido por plans.promotional_price) em vez do
   * preço CHEIO do plano -- um plano com price=79 e promotional_price=59
   * virava 59*0.5=29.50 no checkout real, enquanto a página /planos
   * calculava corretamente Math.min(59, 79*0.5)=39.50 (os dois descontos
   * NUNCA deveriam se compor). `fullPrice` é o preço cheio do plano, com o
   * ajuste anual (×0.8×12) aplicado mas SEM promotional_price -- usado
   * exclusivamente para calcular os 50% da promoção automática, que
   * compete com o resultado de (promotional_price + cupom) via Math.min,
   * nunca soma. Também é este o valor correto a gravar em
   * subscriptions.promo_full_price (o preço a restaurar depois do 1o
   * ciclo é o preço CHEIO do plano, não o promotional_price).
   */
  fullPrice: number
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
  // Cupom continua competindo sobre `basePrice` (já com promotional_price
  // aplicado, se houver) -- comportamento pré-existente, preservado.
  const { preco: precoComCupom, temEfeito: cupomTemEfeito } = aplicarCupom(input.basePrice, input.coupon, input.useUsd)
  const promoAplicavel = input.promoAtiva && input.planElegivel
  // Os 50% da promoção automática são calculados sobre o preço CHEIO
  // (fullPrice), nunca sobre basePrice -- é isso que impede a composição
  // com promotional_price. Quando a promo não se aplica, cai de volta pro
  // caminho antigo (basePrice, com ou sem cupom).
  const precoComPromo = promoAplicavel ? input.fullPrice * 0.5 : input.basePrice

  const promoVenceu = promoAplicavel && precoComPromo <= precoComCupom
  const finalPrice = promoVenceu ? precoComPromo : precoComCupom

  // Mesmo arredondamento final de checkout/route.ts:349 (resíduo de ponto
  // flutuante em desconto percentual) -- uma única fonte de verdade agora.
  return { finalPrice: Math.round(finalPrice * 100) / 100, promoVenceu, cupomTemEfeito }
}

// BUG CORRIGIDO (achado por revisão adversarial, 27/set/2026): .includes()
// puro casava qualquer plano cujo nome contivesse "pro" ou "premium" como
// substring (ex.: um futuro "Perfil Profissional" ou "Produtor Aprovado").
// Word-boundary sozinho não bastaria: um plano futuro chamado "Premium
// Antigo" tem "Premium" como palavra REAL isolada, não uma substring
// acidental -- ainda assim não deveria herdar esta promoção. A promoção
// foi pedida especificamente para "Produtor PRO" e "Premium" (os únicos 2
// planos pagos hoje) -- allowlist por nome EXATO (normalizado por
// case/espaços) é mais previsível e seguro do que qualquer heurística de
// substring: só esses 2 nomes ativam a promoção, nunca uma correspondência
// parcial. Se um admin renomear um desses planos no futuro, a promoção
// para de se aplicar a ele (efeito visível na hora, não um bug silencioso
// ativando em plano errado).
const NOMES_PLANOS_ELEGIVEIS_PROMO = ['produtor pro', 'premium']

export function planElegivelParaPromo(planName: string): boolean {
  const nome = planName.trim().toLowerCase()
  return NOMES_PLANOS_ELEGIVEIS_PROMO.includes(nome)
}
