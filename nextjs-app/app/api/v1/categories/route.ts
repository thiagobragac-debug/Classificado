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

// ─── OPTIONS (CORS preflight) ─────────────────────────────────────────────────
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

// ─── GET /api/v1/categories ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })

  // 1. Authenticate
  const auth = await authenticateApiKey(request)
  if (!auth.ok || !auth.apiKey) {
    return apiError(auth.error!, auth.status!)
  }
  const apiKey = auth.apiKey

  // 2. Check permission
  if (!hasPermission(apiKey, 'read_ads')) {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime, supabase: supabase as any })
    return apiError('Forbidden: this key does not have read_ads permission', 403)
  }

  // 3. Rate limit
  const rateLimit = await checkRateLimit(apiKey, supabase as any)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime, supabase: supabase as any })
    return apiError(
      `Rate limit exceeded. Limit: ${apiKey.rate_limit} req/min. Retry after: ${rateLimit.resetAt}`,
      429,
      { retry_after: rateLimit.resetAt }
    )
  }

  // 4. Query — only active categories, ordered by sort_order
  const { data, error } = await supabase
    .from('categories')
    .select('id, name_pt, name_es, icon, color, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const durationMs = Date.now() - startTime

  if (error) {
    logRequest({ apiKey, request, statusCode: 500, durationMs, supabase: supabase as any })
    return apiError('Internal server error', 500)
  }

  // 5. Log (fire-and-forget)
  logRequest({ apiKey, request, statusCode: 200, durationMs, supabase: supabase as any })

  return Response.json(
    {
      data,
      meta: { total: data?.length ?? 0 },
    },
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        ...rateLimitHeaders(apiKey, rateLimit.remaining, rateLimit.resetAt),
        'X-Response-Time': `${durationMs}ms`,
        // Categories change rarely — allow CDN/clients to cache for 5 minutes
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    }
  )
}
