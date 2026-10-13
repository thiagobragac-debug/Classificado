import { createAdminClient } from '@/lib/supabase-admin'

// Reavalia a cota de anúncios ativos de um usuário depois que o plano dele
// mudou (concessão ou perda de entitlement). Delega pra
// schedule_ad_quota_enforcement (SECURITY DEFINER): se há mais anúncios
// ativos que o teto do plano, agenda o prazo de graça (7 dias) antes de o
// cron pausar o excedente; se NÃO há, apaga qualquer prazo antigo.
//
// Achado ao vivo (03/out/2026), dois buracos nos caminhos que mudam o plano
// fora de enforce_plan_expiration:
//  - rebaixamento por webhook (período já vencido) zerava o plano mas nunca
//    agendava a graça: os excedentes ficavam ativos para sempre;
//  - quem voltava a assinar mantinha o prazo do rebaixamento anterior, e o
//    cron pausava anúncios de um cliente que já estava pagando de novo
//    (enforce_ad_quota_deadlines usa o max_ads GRAVADO na linha pendente).
//
// Contrato do 3º parâmetro:
//  - id de plano  => teto desse plano (concessão de entitlement);
//  - 'GRATIS'     => teto do plano Grátis (rebaixamento);
//  - vazio/plano não resolvido => NÃO FAZ NADA. Antes caía no teto do Grátis,
//    o que agendava a pausa de anúncios de um assinante pago sempre que o
//    plano não era encontrado (ex.: webhook sem plan_id resolvido).
//
// Nunca lança: é uma consequência do plano, não pode derrubar o webhook/
// checkout que a chamou. Falhas viram console.warn pra aparecer nos logs.
export const PLANO_GRATIS = 'GRATIS'

export async function reavaliarCotaAnuncios(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  planId?: string | typeof PLANO_GRATIS | null
): Promise<void> {
  try {
    if (!planId) {
      console.warn(`[AdQuotaGrace] Plano não informado para ${userId}; cota não reavaliada.`)
      return
    }

    let maxAds: number | null = null
    if (planId === PLANO_GRATIS) {
      const { data, error } = await supabase
        .from('plans')
        .select('max_ads')
        .eq('is_active', true)
        .eq('price', 0)
        .order('sort_order')
        .limit(1)
        .maybeSingle()
      if (error) {
        console.warn('[AdQuotaGrace] Falha ao ler o plano Grátis:', error.message)
        return
      }
      maxAds = data?.max_ads ?? null
    } else {
      const { data, error } = await supabase.from('plans').select('max_ads').eq('id', planId).maybeSingle()
      if (error) {
        console.warn(`[AdQuotaGrace] Falha ao ler o plano ${planId}:`, error.message)
        return
      }
      maxAds = data?.max_ads ?? null
    }

    if (maxAds === null) {
      console.warn(`[AdQuotaGrace] Plano ${planId} sem max_ads resolvível; cota de ${userId} não reavaliada.`)
      return
    }

    const { error: rpcErr } = await supabase.rpc('schedule_ad_quota_enforcement', {
      p_user_id: userId,
      p_max_ads: maxAds,
    })
    if (rpcErr) {
      console.warn(`[AdQuotaGrace] schedule_ad_quota_enforcement falhou para ${userId}:`, rpcErr.message)
    }
  } catch (err) {
    console.warn('[AdQuotaGrace] Falha ao reavaliar a cota de anúncios (não afeta o plano):', err instanceof Error ? err.message : err)
  }
}
