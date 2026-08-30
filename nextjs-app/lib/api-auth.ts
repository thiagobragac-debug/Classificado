import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'
import { resolverIpConfiavel, ipParaRateLimit } from './ip-utils'
import { dentroDoLimiteFallback } from './rate-limit-fallback'

// ─── Supabase Client for API auth ─────────────────────────────────────────────
// BUG CORRIGIDO (revisão de código): o fallback silencioso pra anon key fazia
// esta função parecer funcionar mesmo sem SUPABASE_SERVICE_ROLE_KEY configurada
// — mas todo write/log desta rota depende de service_role (RLS bloqueia a anon
// key nessas tabelas), então o degrade era silencioso e só quebraria em
// produção, sem aviso nenhum em deploy/build. Loga alto e cedo em vez de
// mascarar a variável de ambiente faltando.
function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[api-auth] SUPABASE_SERVICE_ROLE_KEY não configurada — usando anon key, writes/rate-limit/log desta API vão falhar em silêncio por RLS.')
  }
  return createClient(SUPABASE_URL, serviceKey || SUPABASE_ANON, { auth: { persistSession: false } })
}

// ─── SHA-256 hash (Web Crypto API — Edge & Node compatible) ───────────────────
export async function sha256(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Extract API key from request headers ─────────────────────────────────────
function extractToken(request: NextRequest): string | null {
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) return apiKeyHeader.trim()
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim()
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ApiKey {
  id: string
  partner_name: string
  permissions: string[]
  rate_limit: number
  environment: string
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
}

export interface AuthResult {
  ok: boolean
  apiKey?: ApiKey
  error?: string
  status?: number
}

// ─── Authenticate API Key ──────────────────────────────────────────────────────
export async function authenticateApiKey(request: NextRequest): Promise<AuthResult> {
  const token = extractToken(request)

  if (!token) {
    return { ok: false, error: 'Missing API key. Provide X-API-Key header or Authorization: Bearer <token>', status: 401 }
  }
  if (!token.startsWith('tk_')) {
    return { ok: false, error: 'Invalid API key format', status: 401 }
  }

  const hash = await sha256(token)
  const supabase = getServiceClient()

  const { data: apiKey, error } = await supabase
    .from('api_keys')
    .select('id, partner_name, permissions, rate_limit, environment, is_active, expires_at, last_used_at')
    .eq('secret_hash', hash)
    .single()

  if (error || !apiKey) {
    // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): tokens inexistentes
    // não tinham limite algum por IP — um flood de tentativas inválidas gerava
    // carga ilimitada de consultas indexadas em api_keys. O limite só conta
    // tentativas que já falharam (chaves válidas nunca passam por aqui), então
    // um parceiro legítimo de alto volume não é afetado.
    //
    // BUG CORRIGIDO (re-auditoria, 2026-08-30): a primeira versão usava
    // `|| 'sem-ip'` como chave de bucket quando não havia header confiável —
    // recriando, ao contrário do resto do projeto, um balde compartilhado
    // entre todo cliente sem IP identificável (mesmo anti-padrão que
    // resolverIpConfiavel() existe justamente para evitar; ver lib/ip-utils.ts
    // e o uso em contact/route.ts). Sem IP confiável, pula o rate limit em vez
    // de agrupar estranhos no mesmo balde — mesma filosofia de fail-open já
    // usada em proxy.ts pros mesmos casos (dev local, proxy mal configurado).
    // ipParaRateLimit trunca IPv6 no prefixo /64 (mesmo motivo de proxy.ts):
    // um endereço IPv6 completo rotaciona fácil demais pra servir de chave
    // de rate limit contra varredura de chaves inválidas.
    const ip = resolverIpConfiavel(request.headers)
    if (ip) {
      const podeTentar = await dentroDoLimiteFallback(supabase, {
        bucket: `apikey_invalida_${ipParaRateLimit(ip)}`,
        limit: 30,
        windowSeconds: 60,
        logPrefix: 'api-auth',
        sensivel: true, // é o próprio controle contra varredura de chaves inválidas — merece alerta se o fail-open disparar
      })
      if (!podeTentar) return { ok: false, error: 'Too many invalid attempts', status: 429 }
    }
    return { ok: false, error: 'Invalid API key', status: 401 }
  }
  if (!apiKey.is_active) return { ok: false, error: 'API key is revoked', status: 401 }
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { ok: false, error: 'API key has expired', status: 401 }
  }

  return { ok: true, apiKey }
}

// ─── Check Permission ─────────────────────────────────────────────────────────
export function hasPermission(apiKey: ApiKey, required: string): boolean {
  if (apiKey.permissions.includes('full_access')) return true
  return apiKey.permissions.includes(required)
}

// ─── Rate Limit ───────────────────────────────────────────────────────────────
// Strategy: Uses Upstash Redis when configured (UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN in .env.local) for horizontal scale.
// Falls back automatically to DB-based sliding window — no config needed.
// O client é criado aqui dentro, com service_role: api_request_logs e api_keys
// não são acessíveis pela anon key. As rotas passavam o próprio client anon
// (mascarado por `as any`), então o fallback de rate limit lia zero registros
// e o last_used_at nunca era gravado.
export async function checkRateLimit(
  apiKey: ApiKey
): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): `0` é falsy em JS, então
  // `rate_limit: 0 || 100` sempre resolvia pra 100 — um admin que tentasse
  // suspender uma chave suspeita zerando o limite, na prática liberava 100
  // req/min. `??` só cai pro padrão quando o valor é null/undefined.
  const limit = apiKey.rate_limit ?? 100
  const resetAt = new Date(Date.now() + 60 * 1000).toISOString()
  const supabase = getServiceClient()

  // ── Upstash Redis path ────────────────────────────────────────────────────
  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (redisUrl && redisToken) {
    try {
      const { Redis }      = await import('@upstash/redis')
      const { Ratelimit }  = await import('@upstash/ratelimit')

      const redis = new Redis({ url: redisUrl, token: redisToken })
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, '60 s'),
        prefix: 'api_rl',
      })

      const { success, remaining, reset } = await ratelimit.limit(`key_${apiKey.id}`)
      return {
        allowed: success,
        remaining,
        resetAt: new Date(reset).toISOString(),
      }
    } catch {
      // Redis failed — fall through to DB fallback silently
    }
  }

  // ── DB fallback (janela deslizante via RPC) ────────────────────────────────
  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): a versão anterior
  // decidia `allowed` contando linhas de api_request_logs — mas esse insert
  // só acontece de forma assíncrona DEPOIS da resposta (logRequest é
  // fire-and-forget, ver abaixo). Uma rajada de requisições concorrentes lia
  // a mesma contagem baixa antes de qualquer uma se registrar, deixando
  // passar bem mais que o limite configurado. check_rate_limit (mesma RPC já
  // usada em todo o resto do projeto para login/checkout/contato) fecha essa
  // corrida específica ao contar e gravar dentro da MESMA chamada — a leitura
  // não fica mais exposta a um insert assíncrono que só acontece depois da
  // resposta. Ressalva (re-auditoria, 2026-08-30): a função em si (SELECT
  // count + INSERT em statements separados, sem lock) não é atômica de
  // verdade sob concorrência real dentro da própria RPC — só fecha a corrida
  // "leitura vs. log assíncrono" que motivou esta troca, não elimina 100% de
  // overshoot sob rajada. Suficiente aqui; não é o limite de última linha
  // pra dados de cartão (esse é tokenize-card, que já loga no Sentry via
  // `sensivel: true` quando o fail-open dispara).
  const allowed = await dentroDoLimiteFallback(supabase, {
    bucket: `apikey_${apiKey.id}`,
    limit,
    windowSeconds: 60,
    logPrefix: 'api-auth-ratelimit',
  })

  // `remaining` continua vindo da contagem de logs — é só informativo (vai no
  // header X-RateLimit-Remaining), não decide mais se a requisição passa.
  const windowStart = new Date(Date.now() - 60 * 1000).toISOString()
  const { count } = await supabase
    .from('api_request_logs')
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKey.id)
    .gte('created_at', windowStart)

  const remaining = Math.max(0, limit - (count || 0))
  return { allowed, remaining, resetAt }
}

// ─── Log Request (fire-and-forget) ────────────────────────────────────────────
export function logRequest(params: {
  apiKey: ApiKey
  request: NextRequest
  statusCode: number
  durationMs: number
}): void {
  const { apiKey, request, statusCode, durationMs } = params
  // service_role: a anon key não tem policy de INSERT em api_request_logs nem
  // de UPDATE em api_keys — os dois writes abaixo falhavam em silêncio, porque
  // o .catch() de fire-and-forget engole o erro.
  const supabase = getServiceClient()
  // BUG CORRIGIDO (varredura de segurança): lia o PRIMEIRO item de
  // x-forwarded-for — exatamente a parte que o cliente controla (mesmo erro
  // já documentado e corrigido em geoip/route.ts). Um parceiro mal-
  // intencionado forjava o IP gravado no log de auditoria de uso da chave.
  // resolverIpConfiavel usa os headers de plataforma / o ÚLTIMO item real.
  const ip = resolverIpConfiavel(request.headers) || '0.0.0.0'

  Promise.all([
    supabase.from('api_request_logs').insert({
      api_key_id: apiKey.id,
      method: request.method,
      endpoint: new URL(request.url).pathname,
      status_code: statusCode,
      ip_address: ip,
      user_agent: request.headers.get('user-agent') || null,
      duration_ms: durationMs,
    }),
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id),
  ]).catch(() => { /* Silent — logging failure never breaks the response */ })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function apiError(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json(
    { error: message, status, ...extra },
    { status, headers: corsHeaders() }
  )
}

export function rateLimitHeaders(apiKey: ApiKey, remaining: number, resetAt: string) {
  // BUG CORRIGIDO (re-auditoria, 2026-08-30): devolvia apiKey.rate_limit cru
  // — se vier null/undefined do banco (o tipo TS não garante isso em
  // runtime; foi exatamente essa premissa que motivou o fix do `?? 100` em
  // checkRateLimit), o header dizia "null" enquanto o limite REALMENTE
  // aplicado já era 100. Mesma resolução usada lá, pra header e aplicação
  // nunca divergirem.
  return {
    'X-RateLimit-Limit': String(apiKey.rate_limit ?? 100),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': resetAt,
  }
}

export function corsHeaders(methods = 'GET, POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json',
  }
}

export { getServiceClient }
