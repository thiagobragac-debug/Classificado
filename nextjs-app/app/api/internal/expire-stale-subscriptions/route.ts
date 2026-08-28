import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import {
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayAdapter,
  GatewayName,
} from '@/lib/gateways'

// BUG CORRIGIDO (validação do zero, rodada 6): a função SQL
// expire_stale_pending_subscriptions() (supabase/migrations/
// 20260826130000_correcoes_revisao_fixes_4a_rodada.sql, rodando via pg_cron
// a cada 5 minutos) só faz UPDATE subscriptions SET status='expired' pra
// linhas 'pending' com mais de 15 minutos — nunca cancela nada de verdade no
// gateway. Se o pending na verdade virou uma assinatura recorrente real (ex.:
// Stripe processou o pagamento mas o webhook de confirmação nunca chegou —
// achado relacionado: todos os 4 secrets de webhook estão vazios em
// produção), o cliente continua sendo cobrado pra sempre mesmo com a linha
// local marcada como "expired"; e se ele tentar de novo, /api/checkout pode
// criar uma SEGUNDA assinatura real em paralelo sem cancelar a primeira.
//
// Uma função SQL/plpgsql rodando via pg_cron não consegue chamar os SDKs de
// gateway (código TypeScript) diretamente. Esta rota faz a parte que
// realmente precisa rodar em Node: busca as 'pending' velhas, cancela de
// verdade no gateway certo quando existir um gateway_subscription_id, e só
// depois marca como 'expired' localmente. A função SQL original continua
// rodando como está (ver comentário lá) — ela já cumpre o propósito
// original dela (impedir que a conta fique travada pra sempre tentando
// assinar de novo), e serve de rede de segurança caso esta rota deixe de
// rodar por qualquer motivo. Esta rota é o mecanismo REAL de limpeza;
// precisa ser agendada externamente (Vercel Cron — ver vercel.json na raiz
// do projeto) apontando pra cá.
//
// Autenticação: Vercel Cron manda 'Authorization: Bearer <CRON_SECRET>'
// quando CRON_SECRET está configurado nas variáveis de ambiente do projeto
// (padrão documentado da Vercel). Fail-closed: sem CRON_SECRET configurado,
// a rota rejeita TODA chamada — isso cancela assinaturas de verdade em
// gateways de pagamento, não pode ficar aberta por engano.
//
// Vercel Cron Jobs disparam via GET (não POST) — ver vercel.json.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[ExpireStaleSubscriptions] CRON_SECRET não configurado — recusando execução.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const settings = await getSettings(supabase)

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: staleRows, error: fetchErr } = await supabase
    .from('subscriptions')
    .select('id, gateway, gateway_subscription_id, status')
    .eq('status', 'pending')
    .lt('created_at', fifteenMinAgo)

  if (fetchErr) {
    console.error('[ExpireStaleSubscriptions] Falha ao buscar assinaturas pendentes:', fetchErr.message)
    return NextResponse.json({ error: 'Falha ao buscar assinaturas pendentes.' }, { status: 500 })
  }

  const results: Array<{ id: string; gatewayCancelled: boolean; error?: string }> = []

  for (const sub of staleRows || []) {
    let gatewayCancelled = false
    let errorMsg: string | undefined

    if (sub.gateway_subscription_id) {
      let adapter: GatewayAdapter | null = null
      const gatewayName = sub.gateway as GatewayName
      try {
        switch (gatewayName) {
          case 'stripe':
            if (settings['stripe_secret_key']) adapter = stripeAdapter(settings['stripe_secret_key'])
            break
          case 'mercadopago':
            if (settings['mp_access_token']) adapter = mercadoPagoAdapter(settings['mp_access_token'])
            break
          case 'pagarme':
            if (settings['pagarme_api_key']) adapter = pagarmeAdapter(settings['pagarme_api_key'])
            break
          case 'asaas':
            if (settings['asaas_api_key']) adapter = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox')
            break
        }
        if (adapter) {
          await adapter.cancelSubscription(sub.gateway_subscription_id)
          gatewayCancelled = true
        } else {
          errorMsg = `Gateway '${gatewayName}' sem credenciais configuradas — não cancelado no gateway.`
          console.warn(`[ExpireStaleSubscriptions] ${errorMsg} (sub ${sub.id})`)
        }
      } catch (err: any) {
        errorMsg = err.message
        console.error(`[ExpireStaleSubscriptions] Falha ao cancelar ${sub.id} no gateway ${gatewayName}:`, err.message)
      }
    } else {
      // Nunca chegou a existir de verdade no gateway (ex.: caiu antes da
      // chamada de criação) — nada a cancelar remotamente.
      gatewayCancelled = true
    }

    // Marca como 'expired' independentemente do resultado do cancelamento no
    // gateway — uma falha ali fica registrada em errorMsg pra acompanhamento
    // manual, mas não deve deixar a conta travada pra sempre (mesmo
    // propósito original da função SQL).
    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', sub.id)
      .eq('status', 'pending')

    if (updateErr) {
      console.error(`[ExpireStaleSubscriptions] Falha ao marcar ${sub.id} como expired:`, updateErr.message)
    }

    results.push({ id: sub.id, gatewayCancelled, error: errorMsg })
  }

  return NextResponse.json({ processed: results.length, results })
}
