import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'
import {
  authenticateApiKey,
  hasPermission,
  checkRateLimit,
  logRequest,
  apiError,
  corsHeaders,
  rateLimitHeaders,
} from '@/lib/api-auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders('GET, OPTIONS') })
}

// ─── GET /api/v1/users ────────────────────────────────────────────────────────
// Returns public profile data only — NO emails, passwords or sensitive data.
// Private fields (email, phone) are only returned for full_access keys.
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })

  const auth = await authenticateApiKey(request)
  if (!auth.ok || !auth.apiKey) return apiError(auth.error!, auth.status!)
  const apiKey = auth.apiKey

  if (!hasPermission(apiKey, 'read_users')) {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime, supabase: supabase as any })
    return apiError('Forbidden: this key does not have read_users permission', 403)
  }

  const rateLimit = await checkRateLimit(apiKey, supabase as any)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime, supabase: supabase as any })
    return apiError(`Rate limit exceeded. Retry after: ${rateLimit.resetAt}`, 429, { retry_after: rateLimit.resetAt })
  }

  const { searchParams } = new URL(request.url)
  const country        = searchParams.get('country')
  const verifiedParam  = searchParams.get('verified')  // 'true' | null
  const plan           = searchParams.get('plan')
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit          = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const from           = (page - 1) * limit

  // Public-safe fields — no email, no phone for non-full_access keys
  const isFullAccess = apiKey.permissions.includes('full_access')
  const selectFields = isFullAccess
    ? 'id, name, avatar_url, bio, country, state, city, plan, verified, ads_count, created_at, phone_whatsapp, banner_url'
    : 'id, name, avatar_url, bio, country, state, city, plan, verified, ads_count, created_at, banner_url'

  let q = supabase
    .from('profiles')
    .select(selectFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (country)               q = q.eq('country', country)
  if (verifiedParam === 'true') q = q.eq('verified', true)  // only filter when explicitly requested
  if (plan)                  q = q.eq('plan', plan)


  const { data, error, count } = await q
  const durationMs = Date.now() - startTime

  if (error) {
    logRequest({ apiKey, request, statusCode: 500, durationMs, supabase: supabase as any })
    return apiError('Internal server error', 500)
  }

  logRequest({ apiKey, request, statusCode: 200, durationMs, supabase: supabase as any })

  const totalPages = count ? Math.ceil(count / limit) : 1
  return Response.json(
    {
      data,
      meta: {
        page,
        limit,
        total: count,
        total_pages: totalPages,
        has_more: page < totalPages,
        fields_scope: isFullAccess ? 'full_access' : 'public_only',
      },
    },
    {
      status: 200,
      headers: {
        ...corsHeaders('GET, OPTIONS'),
        ...rateLimitHeaders(apiKey, rateLimit.remaining, rateLimit.resetAt),
        'X-Response-Time': `${durationMs}ms`,
      },
    }
  )
}
