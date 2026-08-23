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

// ─── GET /api/v1/ads/:id ──────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime })
    return apiError('Forbidden: this key does not have read_ads permission', 403)
  }

  // 3. Rate limit
  const rateLimit = await checkRateLimit(apiKey)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime })
    return apiError(
      `Rate limit exceeded. Limit: ${apiKey.rate_limit} req/min. Retry after: ${rateLimit.resetAt}`,
      429,
      { retry_after: rateLimit.resetAt }
    )
  }

  // 4. Validate ID
  const { id } = await params
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return apiError('Invalid ad ID format. Expected a UUID.', 400)
  }

  // 5. Query
  const { data, error } = await supabase
    .from('ads')
    .select(
      'id, title_pt, title_es, description, price, currency, price_unit_pt, negotiable, condition, status, featured, images, category_id, city, state, country, location_text, video_url, tags_pt, views_count, created_at, updated_at, expires_at, profiles!user_id(id, name, avatar_url, verified, phone_whatsapp)'
    )
    .eq('id', id)
    .eq('status', 'active')
    .single()

  const durationMs = Date.now() - startTime

  if (error || !data) {
    logRequest({ apiKey, request, statusCode: 404, durationMs })
    return apiError('Ad not found or not active', 404)
  }

  // 6. Log (fire-and-forget)
  logRequest({ apiKey, request, statusCode: 200, durationMs })

  return Response.json(
    { data },
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        ...rateLimitHeaders(apiKey, rateLimit.remaining, rateLimit.resetAt),
        'X-Response-Time': `${durationMs}ms`,
      },
    }
  )
}
