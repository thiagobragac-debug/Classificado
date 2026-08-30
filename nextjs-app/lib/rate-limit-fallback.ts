import type { SupabaseClient } from '@supabase/supabase-js'

// Fallback de rate limit via a RPC check_rate_limit (janela deslizante no
// Postgres) — reimplementado identicamente em proxy.ts e em toda rota que
// precisa de um teto mesmo sem Upstash configurado (algumas nunca tiveram
// Upstash, e usam só este fallback). Fail-open deliberado: uma
// indisponibilidade do banco não pode travar login/checkout/contato pra todo
// mundo — mas nunca em silêncio, por isso sempre loga o motivo.
export async function dentroDoLimiteFallback(
  supabase: SupabaseClient,
  params: { bucket: string; limit: number; windowSeconds?: number; logPrefix: string; sensivel?: boolean }
): Promise<boolean> {
  const { bucket, limit, windowSeconds = 60, logPrefix, sensivel = false } = params
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error(`[${logPrefix}] check_rate_limit falhou, liberando a requisição:`, error.message)
      if (sensivel) await avisarFallbackSensivel(logPrefix, error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.error(`[${logPrefix}] check_rate_limit indisponível, liberando a requisição:`, (e as Error).message)
    if (sensivel) await avisarFallbackSensivel(logPrefix, (e as Error).message)
    return true
  }
}

// BUG CORRIGIDO (auditoria de segurança, 2026-08-30): o fail-open acima é
// deliberado (uma indisponibilidade de banco não pode travar checkout pra
// todo mundo), mas em rotas que veem PAN/CVV em claro (tokenize-card) esse
// mesmo fail-open, numa falha do RPC, deixa a tentativa de cartão
// TEMPORARIAMENTE sem limite algum — facilitando card-testing. `sensivel:
// true` eleva esse caso específico pro Sentry (se configurado) em vez de só
// console.error, sem mudar o comportamento fail-open em si.
async function avisarFallbackSensivel(logPrefix: string, motivo: string): Promise<void> {
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureMessage(`[rate-limit fail-open] ${logPrefix}: ${motivo}`, 'warning')
  } catch {
    // Sentry indisponível — o console.error já feito acima é o melhor que dá.
  }
}
