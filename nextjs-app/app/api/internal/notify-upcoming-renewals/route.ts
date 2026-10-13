import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { assinaturaConfere } from '@/lib/gateways/signature'
import { montarEmailAvisoRenovacao, enviarSemBloquear, idiomaPorPais } from '@/lib/subscription-emails'

// Aviso ANTES da 1ª cobrança cheia -- F11 da auditoria de 12/out/2026.
//
// Quem assinou com a promoção "50% OFF no 1º ciclo" será cobrado o preço CHEIO na
// primeira renovação. Sem aviso é o fluxo clássico de chargeback/reclamação (PRO
// mensal R$39,50 -> R$79,00; anual R$379,20 -> R$758,40, 12 meses depois, quando o
// cliente já esqueceu). Este job manda UM e-mail por assinatura, com antecedência
// de 7 dias (mensal) ou 30 dias (anual), com o valor e a data da cobrança e o link
// para cancelar.
//
// Só a PRIMEIRA renovação interessa (as seguintes não têm surpresa): considera
// apenas assinaturas cujo fim de período atual está a ~1 ciclo da criação.
// Idempotência sem coluna nova: uma linha em webhook_events com chave
// `notice:renewal:<assinatura>:<data da cobrança>` -- gravada ANTES do envio e
// removida se o envio falhar, para a próxima execução tentar de novo.
//
// Mesmo padrão de autenticação das demais rotas /api/internal/*: Bearer
// CRON_SECRET, fail-closed, comparação em tempo constante.
const JANELA_DIAS = { monthly: 7, annual: 30 } as const
const DIA_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[NotifyUpcomingRenewals] CRON_SECRET não configurado — recusando execução.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (!assinaturaConfere(`Bearer ${cronSecret}`, req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan, billing_cycle, currency, created_at, current_period_end, promo_full_price, cancel_at_period_end')
    .eq('status', 'active')
    .not('promo_full_price', 'is', null)
    .not('current_period_end', 'is', null)
    .limit(1000)
  if (error) {
    console.error('[NotifyUpcomingRenewals] Falha ao buscar assinaturas:', error.message)
    return NextResponse.json({ error: 'Falha ao buscar assinaturas.' }, { status: 500 })
  }

  const agora = Date.now()
  let candidatos = 0, enviados = 0, jaAvisados = 0, falhas = 0
  for (const s of subs || []) {
    try {
      if (s.cancel_at_period_end) continue // vai cancelar sozinho: nada a avisar
      const ciclo = s.billing_cycle === 'annual' ? 'annual' : 'monthly'
      const fim = new Date(s.current_period_end as string)
      const faltamMs = fim.getTime() - agora
      if (faltamMs <= 0 || faltamMs > JANELA_DIAS[ciclo] * DIA_MS) continue

      // só a 1ª renovação: o fim do período atual ~ criação + 1 ciclo
      const primeiroFim = new Date(s.created_at as string)
      if (ciclo === 'annual') primeiroFim.setFullYear(primeiroFim.getFullYear() + 1)
      else primeiroFim.setMonth(primeiroFim.getMonth() + 1)
      if (Math.abs(fim.getTime() - primeiroFim.getTime()) > 3 * DIA_MS) continue

      candidatos++
      const chave = `notice:renewal:${s.id}:${fim.toISOString().slice(0, 10)}`
      const { error: insErr } = await supabase.from('webhook_events').insert({ id: chave, gateway: 'internal', event_type: 'renewal_notice' })
      if (insErr) {
        if (insErr.code === '23505') { jaAvisados++; continue }
        falhas++
        console.error(`[NotifyUpcomingRenewals] Falha ao registrar o aviso de ${s.id}:`, insErr.message)
        continue
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(s.user_id as string)
      const email = authUser?.user?.email
      const { data: perfil } = await supabase.from('profiles').select('country').eq('id', s.user_id as string).maybeSingle()
      const enviado = email
        ? await enviarSemBloquear(
            email,
            montarEmailAvisoRenovacao({
              plano: s.plan as string,
              ciclo,
              valorCheio: Number(s.promo_full_price),
              moeda: (s.currency as string) || 'BRL',
              dataCobranca: fim,
              idioma: idiomaPorPais(perfil?.country),
            }),
            `aviso de renovação da assinatura ${s.id}`,
          )
        : false
      if (enviado) {
        enviados++
      } else {
        falhas++
        // libera a chave para a próxima execução tentar de novo
        await supabase.from('webhook_events').delete().eq('id', chave)
      }
    } catch (err: any) {
      falhas++
      console.error(`[NotifyUpcomingRenewals] Erro inesperado na assinatura ${s.id}:`, err?.message || err)
    }
  }

  return NextResponse.json({ candidatos, enviados, jaAvisados, falhas })
}
