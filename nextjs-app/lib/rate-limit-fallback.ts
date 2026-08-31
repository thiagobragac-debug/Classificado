import { createAdminClient } from './supabase-admin'

// Fallback de rate limit via a RPC check_rate_limit (janela deslizante no
// Postgres) — reimplementado identicamente em proxy.ts e em toda rota que
// precisa de um teto mesmo sem Upstash configurado (algumas nunca tiveram
// Upstash, e usam só este fallback). Fail-open deliberado: uma
// indisponibilidade do banco não pode travar login/checkout/contato pra todo
// mundo — mas nunca em silêncio, por isso sempre loga o motivo.
//
// BUG CORRIGIDO (auditoria de segurança, 2026-08-30): esta função sempre
// recebeu o client de quem a chamava (anon ou da sessão do usuário) — e
// check_rate_limit() precisa de EXECUTE liberado pra `anon` pra funcionar
// antes do login. Como o bucket/limite são parâmetros de texto livre
// escolhidos pelo CHAMADOR, qualquer um com a anon key pública (que é
// pública por design) podia chamar a RPC direto via PostgREST com o mesmo
// bucket de uma vítima real (ex.: `login_<ip-da-vítima>`) e um p_limit alto,
// pré-enchendo a janela dela — negação de serviço direcionada sem precisar
// de autenticação. Não há como distinguir, a nível de GRANT do Postgres,
// "app server chamando com a anon key" de "atacante chamando com a mesma
// anon key pública" — os dois são o mesmo papel. A correção real é não
// depender de GRANT a anon/authenticated: todo chamador desta função no
// código do app já roda em contexto de servidor confiável (middleware, route
// handlers), então ela sempre usa seu próprio client de service_role aqui
// dentro, e a migration correspondente revoga o EXECUTE de anon/authenticated
// (mesmo padrão já usado para as RPCs de cupom).
export async function dentroDoLimiteFallback(
  params: { bucket: string; limit: number; windowSeconds?: number; logPrefix: string; sensivel?: boolean }
): Promise<boolean> {
  const { bucket, limit, windowSeconds = 60, logPrefix, sensivel = false } = params
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('check_rate_limit', {
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
