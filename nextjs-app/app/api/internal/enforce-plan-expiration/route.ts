import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { assinaturaConfere } from '@/lib/gateways/signature'

// Varredura de planos com período pago vencido.
//
// BUG CORRIGIDO (achado pelo mapeamento adversarial e confirmado em 03/out/
// 2026): enforce_plan_expiration() só era chamada quando o PRÓPRIO usuário
// abria /painel. Quem cancela (o gateway cancela de imediato, então nenhum
// webhook novo chega depois do fim do período) e nunca volta ao painel
// mantinha plano, limites e anúncios pagos por tempo indeterminado. Esta
// rota roda a mesma função para todo usuário cujo plan_expires_at já passou
// (a função em si decide: só rebaixa plano <> 'free' com período vencido, e
// agenda o prazo de graça dos anúncios excedentes).
//
// Mesmo padrão de autenticação das demais rotas /api/internal/*: Bearer
// CRON_SECRET, fail-closed, comparação em tempo constante. Agendar ~1x/dia
// (ex.: cron-job.org, junto com reconcile-promo-pricing).
const LOTE_MAX = 500

// Margem antes de a varredura rebaixar: o webhook de renovação pode chegar
// com horas de atraso (retentativas do gateway), e enforce_plan_expiration
// não tem folga própria — sem esta margem o cron rebaixaria um assinante que
// acabou de pagar. A visita ao /painel continua aplicando sem margem (o
// próprio usuário está olhando), e o webhook tardio reativa a assinatura.
const MARGEM_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[EnforcePlanExpiration] CRON_SECRET não configurado — recusando execução.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (!assinaturaConfere(`Bearer ${cronSecret}`, req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  // inner join em user_secrets: só quem ainda tem plano pago interessa (a
  // função ignora 'free'; sem o filtro, perfis free com plan_expires_at
  // residual ocupariam o lote de 500 e esconderiam os que precisam rebaixar).
  const limite = new Date(Date.now() - MARGEM_MS).toISOString()
  const { data: vencidos, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, user_secrets!inner(plan)')
    .not('plan_expires_at', 'is', null)
    .lt('plan_expires_at', limite)
    .neq('user_secrets.plan', 'free')
    .order('plan_expires_at', { ascending: true })
    .limit(LOTE_MAX)

  if (fetchErr) {
    console.error('[EnforcePlanExpiration] Falha ao buscar perfis vencidos:', fetchErr.message)
    return NextResponse.json({ error: 'Falha ao buscar perfis vencidos.' }, { status: 500 })
  }

  // F74 (auditoria 12/out/2026): a PRIMEIRA execução rebaixa em lote tudo o que se
  // acumulou desde que o plano vencia sem ninguém olhar. `?dry=1` só LISTA quem seria
  // rebaixado (sem chamar a função), para conferir antes de ligar o cron de verdade.
  if (new URL(req.url).searchParams.get('dry') === '1') {
    return NextResponse.json({
      dryRun: true,
      candidatos: vencidos?.length ?? 0,
      ids: (vencidos || []).map((p: any) => p.id),
      truncado: (vencidos?.length ?? 0) === LOTE_MAX,
    })
  }

  let processados = 0
  let falhas = 0
  for (const p of vencidos || []) {
    try {
      const { error } = await supabase.rpc('enforce_plan_expiration', { p_user_id: p.id })
      if (error) {
        falhas++
        console.error(`[EnforcePlanExpiration] Falha ao aplicar para ${p.id}:`, error.message)
      } else {
        processados++
      }
    } catch (err) {
      falhas++
      console.error(`[EnforcePlanExpiration] Erro inesperado para ${p.id}:`, err instanceof Error ? err.message : err)
    }
  }

  const candidatos = vencidos?.length ?? 0
  // Falha total (ex.: RPC ausente/permissão) precisa aparecer no monitor do
  // agendador como erro, não como 200 "ok".
  if (falhas > 0 && processados === 0) {
    return NextResponse.json({ candidatos, processados, falhas, error: 'Todas as execuções falharam.' }, { status: 500 })
  }
  return NextResponse.json({ candidatos, processados, falhas, truncado: candidatos === LOTE_MAX })
}
