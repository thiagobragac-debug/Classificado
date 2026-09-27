import { createAdminClient } from '@/lib/supabase-admin'

// Registra falhas reais de processamento de webhook (achado ao vivo,
// 27/set/2026: essas falhas só existiam como console.warn/error, perdidas
// assim que os logs efêmeros do Render expiram) -- alimenta o indicador
// "Falhas de Webhook" em /admin/monitoramento. Best-effort: uma falha
// gravando o LOG não pode nunca derrubar o processamento real do webhook.
//
// Extraído de webhook-handler.ts (27/set/2026) pra lib/gateways/promo-
// reajuste.ts também poder reaproveitar sem criar import circular entre os
// dois (promo-reajuste é chamado DE DENTRO de webhook-handler).
export async function logWebhookFailure(
  supabase: ReturnType<typeof createAdminClient>,
  gateway: string,
  eventType: string | undefined,
  reason: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from('webhook_failures').insert({ gateway, event_type: eventType, reason, details: details || {} })
  } catch (err) {
    console.error('[Webhook] Falha ao registrar webhook_failures (não afeta o processamento):', err)
  }
}
