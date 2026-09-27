import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { stripeAdapter, mercadoPagoAdapter, pagarmeAdapter, asaasAdapter, GatewayAdapter, GatewayName } from '@/lib/gateways'
import { logWebhookFailure } from './webhook-failure-log'

// Reajuste de volta ao preço cheio depois do 1o ciclo da promoção "50% OFF"
// (achado ao vivo, 27/set/2026) -- chamado tanto pelo branch
// subscription.renewed do webhook-handler.ts (reage ao evento) quanto pela
// rota de cron app/api/internal/reconcile-promo-pricing (varredura
// preventiva, roda DENTRO do próprio 1o ciclo -- ver comentário no cron
// sobre por que reagir só ao webhook chegaria um ciclo atrasado demais).
//
// Nunca lança -- todo erro (rede, gateway, banco) é capturado e devolvido
// como {ok:false}, e a linha correspondente em `subscriptions` continua
// com promo_first_cycle_pending=true pra próxima tentativa. Perder esse
// sinal deixaria o cliente pagando 50% pra sempre por engano -- o oposto
// do "máxima robustez" pedido.

type SubRow = {
  id: string
  gateway: GatewayName
  gateway_subscription_id: string | null
  plan: string
  billing_cycle: 'monthly' | 'annual'
  currency: string | null
  promo_full_price: number | null
  promo_reajuste_attempts: number
  promo_reajuste_last_attempted_at: string | null
}

const JANELA_LEASE_MS = 10 * 60 * 1000 // 10min -- folgado o bastante pra qualquer chamada HTTP real, curto o bastante pra não travar um retry legítimo por muito tempo

function buildAdapter(gateway: GatewayName, settings: Record<string, string>): GatewayAdapter | null {
  switch (gateway) {
    case 'stripe':
      return settings['stripe_secret_key'] ? stripeAdapter(settings['stripe_secret_key']) : null
    case 'mercadopago':
      return settings['mp_access_token'] ? mercadoPagoAdapter(settings['mp_access_token']) : null
    case 'pagarme':
      return settings['pagarme_api_key'] ? pagarmeAdapter(settings['pagarme_api_key']) : null
    case 'asaas':
      return settings['asaas_api_key']
        ? asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox')
        : null
    default:
      return null
  }
}

export async function tentarReajustarPrimeiroCiclo(
  supabase: ReturnType<typeof createAdminClient>,
  sub: SubRow
): Promise<{ ok: boolean; reason: string }> {
  if (!sub.gateway_subscription_id) {
    // Cupom 100% off (bypass local, nunca chamou gateway nenhum) -- não há
    // nada pra reajustar num gateway que nunca existiu; só encerra o
    // pendente localmente.
    await supabase.from('subscriptions')
      .update({ promo_first_cycle_pending: false })
      .eq('id', sub.id)
      .eq('promo_first_cycle_pending', true)
    return { ok: true, reason: 'no_gateway_subscription_bypass' }
  }
  if (sub.promo_full_price === null || sub.promo_full_price === undefined) {
    return { ok: false, reason: 'promo_full_price_missing' } // não deveria acontecer -- constraint do banco já impede
  }

  // --- Lease, não claim destrutivo: zero linhas afetadas = outro processo
  // (webhook ou cron) já está tentando, ou já resolveu. ---
  const agora = new Date()
  let leaseQuery = supabase
    .from('subscriptions')
    .update({
      promo_reajuste_last_attempted_at: agora.toISOString(),
      promo_reajuste_attempts: sub.promo_reajuste_attempts + 1,
    })
    .eq('id', sub.id)
    .eq('promo_first_cycle_pending', true)
  leaseQuery = sub.promo_reajuste_last_attempted_at
    ? leaseQuery.lt('promo_reajuste_last_attempted_at', new Date(agora.getTime() - JANELA_LEASE_MS).toISOString())
    : leaseQuery.is('promo_reajuste_last_attempted_at', null)
  const { data: claimed } = await leaseQuery.select('id')
  if (!claimed?.length) {
    return { ok: false, reason: 'lease_not_acquired' }
  }

  // BUG ALTO CORRIGIDO (revisão adversarial, 27/set/2026): getSettings()
  // pode lançar (erro de rede/DB) -- sem este try/catch, essa exceção
  // escapava da promessa que este arquivo faz de "nunca lançar" (ver
  // comentário no topo). No branch subscription.renewed do webhook-handler
  // isso rasgaria o catch mais externo daquele handler e poderia derrubar a
  // confirmação de renovação inteira por causa de uma falha que só diz
  // respeito ao reajuste da promoção.
  let settings: Record<string, string>
  try {
    settings = await getSettings(supabase)
  } catch (err: any) {
    const msg = err?.message || String(err)
    await supabase.from('subscriptions').update({ promo_reajuste_last_error: msg }).eq('id', sub.id)
    await logWebhookFailure(supabase, sub.gateway, 'promo_reajuste', 'promo_reajuste_failed', { subscriptionId: sub.id, message: msg })
    return { ok: false, reason: 'settings_fetch_failed' }
  }
  const adapter = buildAdapter(sub.gateway, settings)
  if (!adapter?.updateSubscriptionPlan) {
    const msg = `Gateway '${sub.gateway}' não configurado ou sem suporte a updateSubscriptionPlan`
    await supabase.from('subscriptions').update({ promo_reajuste_last_error: msg }).eq('id', sub.id)
    await logWebhookFailure(supabase, sub.gateway, 'promo_reajuste', 'promo_reajuste_failed', { subscriptionId: sub.id, message: msg })
    return { ok: false, reason: 'adapter_unavailable' }
  }

  try {
    // Nonce DETERMINÍSTICO (não por tentativa) -- diverge de propósito da
    // regra geral de types.ts (nonce único por tentativa, pra permitir
    // repetir uma troca de plano legítima no mesmo dia): esta operação só
    // pode acontecer UMA VEZ na vida da assinatura. Um retry com o MESMO
    // nonce faz a Stripe devolver a resposta idempotente em vez de criar
    // um Product órfão novo se a chamada teve sucesso mas o UPDATE local
    // de confirmação (abaixo) falhar antes de commitar.
    await adapter.updateSubscriptionPlan(
      sub.gateway_subscription_id,
      { id: sub.plan, name: sub.plan, price: sub.promo_full_price, billingCycle: sub.billing_cycle, currency: sub.currency || undefined },
      /* prorate */ false, // nunca cobra nem credita nada agora -- só muda o valor da PRÓXIMA fatura
      `promo-reajuste:${sub.id}`
    )
  } catch (err: any) {
    const msg = err?.message || String(err)
    await supabase.from('subscriptions').update({ promo_reajuste_last_error: msg }).eq('id', sub.id)
    await logWebhookFailure(supabase, sub.gateway, 'promo_reajuste', 'promo_reajuste_failed', { subscriptionId: sub.id, message: msg })
    return { ok: false, reason: 'gateway_call_failed' }
  }

  // O toggle do admin (promo_primeiro_ciclo_ativo) NUNCA é reconsultado
  // aqui -- só importa no momento do checkout. Se o admin desligar a
  // promoção no meio do caminho, quem já comprou com ela ligada ainda deve
  // ser reajustado ao preço cheio conforme prometido.
  const { data: confirmResult, error: confirmErr } = await supabase.from('subscriptions')
    .update({
      promo_first_cycle_pending: false,
      price: sub.promo_full_price,
      promo_reajuste_last_error: null,
    })
    .eq('id', sub.id)
    .eq('promo_first_cycle_pending', true)
    .select('id')

  // BUG ALTO CORRIGIDO (revisão adversarial, 27/set/2026): o gateway já foi
  // reajustado com sucesso neste ponto -- mas se ESTA escrita local falhar
  // (erro do Postgres; postgrest-js nunca lança por isso, só devolve
  // {error}) e a função devolvesse {ok:true} do mesmo jeito, o chamador (cron
  // ou webhook) julgaria a promoção encerrada enquanto o banco continua
  // promo_first_cycle_pending=true pra sempre -- nenhuma tentativa futura
  // aconteceria porque ninguém saberia que precisa tentar de novo. Devolver
  // {ok:false} aqui garante que a próxima varredura do cron tente de novo
  // (o retry é seguro: mesmo nonce determinístico, mesmo preço).
  if (confirmErr || !confirmResult || confirmResult.length === 0) {
    const msg = confirmErr?.message || 'nenhuma linha afetada ao confirmar reajuste local'
    await logWebhookFailure(supabase, sub.gateway, 'promo_reajuste', 'promo_reajuste_failed', { subscriptionId: sub.id, message: `Gateway reajustado com sucesso, mas confirmação local falhou: ${msg}` })
    return { ok: false, reason: 'local_confirmation_failed' }
  }

  return { ok: true, reason: 'reajustado' }
}
