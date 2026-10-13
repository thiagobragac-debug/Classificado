import type { SupabaseClient } from '@supabase/supabase-js'

// Elegibilidade da promoção "50% OFF no primeiro ciclo" -- achado F01 da
// auditoria de 12/out/2026 (confirmado ao vivo em Pagar.me e Stripe): a
// promoção é de AQUISIÇÃO e deve valer UMA vez por usuário, mas nada guardava
// memória disso -- o cancelamento limpa promo_first_cycle_pending/
// promo_full_price de propósito (senão o cron de reajuste cobraria o preço
// cheio de uma assinatura já cancelada), então cancelar e reassinar devolvia
// os 50% indefinidamente (PRO mensal: R$474/ano a menos por usuário).
//
// Regra: o usuário JÁ CONSUMIU a promoção se tem (ou teve) qualquer assinatura
// paga de verdade -- preço > 0, com período de acesso concedido (current_period_
// end preenchido, ou seja, o pagamento foi confirmado/ativado) e em um status
// que prova isso. Uma linha 'pending' nunca ativada (checkout abandonado, cartão
// recusado, reaper) NÃO conta: quem nunca pagou continua elegível. Cupom 100%
// (preço 0) também não conta.
//
// Sem coluna nova de propósito: usa o histórico de `subscriptions`, que nenhum
// caminho de cancelamento/expiração apaga (só o checkout recusado apaga o lock
// que acabou de criar, e esse nunca tem current_period_end).
export const STATUS_QUE_PROVAM_PAGAMENTO = ['active', 'past_due', 'cancelled', 'expired', 'switch_applied'] as const

/**
 * Devolve true se o usuário já teve assinatura paga. Em erro de banco devolve
 * true (falha FECHADA: cobra o preço cheio em vez de arriscar dar o desconto
 * de novo). O guard de preço do checkout (409 price_changed) avisa o usuário
 * se isso mudar o valor que ele viu.
 */
export async function usuarioJaConsumiuPromo(
  supabase: SupabaseClient,
  userId: string,
  ignorarSubscriptionId?: string,
): Promise<boolean> {
  let q = supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .gt('price', 0)
    .not('current_period_end', 'is', null)
    .in('status', [...STATUS_QUE_PROVAM_PAGAMENTO])
    .limit(1)
  if (ignorarSubscriptionId) q = q.neq('id', ignorarSubscriptionId)
  const { data, error } = await q
  if (error) {
    console.error('[promo-elegibilidade] falha ao consultar histórico de assinaturas -- negando a promo por segurança:', error.message)
    return true
  }
  return (data?.length ?? 0) > 0
}
