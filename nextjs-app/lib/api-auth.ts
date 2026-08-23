import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'

// ─── Supabase Client for API auth ─────────────────────────────────────────────
// Uses service role key when available. Falls back to anon key — covered by RLS policies.
function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
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

  if (error || !apiKey) return { ok: false, error: 'Invalid API key', status: 401 }
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
  const limit = apiKey.rate_limit || 100
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

  // ── DB fallback (sliding window via api_request_logs) ────────────────────
  const windowStart = new Date(Date.now() - 60 * 1000).toISOString()
  const { count } = await supabase
    .from('api_request_logs')
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKey.id)
    .gte('created_at', windowStart)

  const used      = count || 0
  const remaining = Math.max(0, limit - used)
  return { allowed: used < limit, remaining, resetAt }
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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
             || request.headers.get('x-real-ip')
             || '0.0.0.0'

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
  return {
    'X-RateLimit-Limit': String(apiKey.rate_limit),
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
