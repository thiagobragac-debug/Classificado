import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { assinaturaConfere } from '@/lib/gateways/signature'
import { tentarReajustarPrimeiroCiclo } from '@/lib/gateways/promo-reajuste'

// Cron de segurança da promoção "50% OFF no primeiro ciclo" (achado ao vivo,
// 27/set/2026) -- segunda camada de defesa além do branch subscription.
// renewed em lib/gateways/webhook-handler.ts.
//
// IMPORTANTE: isto NÃO é "só reprocessa falhas do webhook". updateSubscription
// Plan com prorate=false nunca cobra/credita nada na hora -- só muda o valor
// da PRÓXIMA fatura. Reagir só ao evento de renovação corrigiria o preço
// tarde demais: subscription.renewed CONFIRMA que a fatura seguinte já foi
// cobrada no valor promocional, então reajustar ali só evitaria um 3o ciclo
// promocional, deixando o desconto vazar por 2 ciclos em vez de 1. Por isso
// esta rota varre TODA assinatura com promo_first_cycle_pending=true
// incondicionalmente (sem filtro de tempo) -- rodando ~1x/dia, ela corrige o
// preço DENTRO do próprio 1o ciclo, antes da renovação cobrar de novo. O
// webhook fica como reforço, idempotente com este cron via o mesmo lease em
// tentarReajustarPrimeiroCiclo.
//
// Mesmo padrão de autenticação de app/api/internal/expire-stale-subscriptions
// /route.ts: Bearer CRON_SECRET, fail-closed, comparação em tempo constante.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[ReconcilePromoPricing] CRON_SECRET não configurado — recusando execução.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization')
  if (!assinaturaConfere(`Bearer ${cronSecret}`, authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: pendentes, error: fetchErr } = await supabase
    .from('subscriptions')
    .select('id, gateway, gateway_subscription_id, plan, billing_cycle, currency, promo_full_price, promo_reajuste_attempts, promo_reajuste_last_attempted_at')
    .eq('promo_first_cycle_pending', true)
    .in('status', ['active', 'past_due'])

  if (fetchErr) {
    console.error('[ReconcilePromoPricing] Falha ao buscar assinaturas pendentes:', fetchErr.message)
    return NextResponse.json({ error: 'Falha ao buscar assinaturas pendentes.' }, { status: 500 })
  }

  const results: Array<{ id: string; ok: boolean; reason: string }> = []
  for (const sub of pendentes || []) {
    const r = await tentarReajustarPrimeiroCiclo(supabase, sub as any)
    results.push({ id: sub.id, ...r })
  }

  return NextResponse.json({ processed: results.length, results })
}
