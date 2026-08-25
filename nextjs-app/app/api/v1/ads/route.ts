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
  getServiceClient,
} from '@/lib/api-auth'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders('GET, POST, OPTIONS') })
}

// ─── GET /api/v1/ads ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })

  const auth = await authenticateApiKey(request)
  if (!auth.ok || !auth.apiKey) return apiError(auth.error!, auth.status!)
  const apiKey = auth.apiKey

  if (!hasPermission(apiKey, 'read_ads')) {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime })
    return apiError('Forbidden: this key does not have read_ads permission', 403)
  }

  const rateLimit = await checkRateLimit(apiKey)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime })
    return apiError(`Rate limit exceeded. Retry after: ${rateLimit.resetAt}`, 429, { retry_after: rateLimit.resetAt })
  }

  const { searchParams } = new URL(request.url)
  const category  = searchParams.get('category')
  const country   = searchParams.get('country')
  const state     = searchParams.get('state')
  const city      = searchParams.get('city')
  const search    = searchParams.get('search')
  const featured  = searchParams.get('featured') === 'true'
  const page      = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit     = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const from      = (page - 1) * limit

  let q = supabase
    .from('ads')
    .select(
      'id, title_pt, title_es, description, price, currency, price_unit_pt, negotiable, condition, status, featured, images, category_id, city, state, country, location_text, views_count, created_at, expires_at, profiles!user_id(name, avatar_url, verified)',
      { count: 'exact' }
    )
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (category) q = q.eq('category_id', category)
  if (country)  q = q.eq('country', country)
  if (state)    q = q.eq('state', state)
  if (city)     q = q.eq('city', city)
  if (featured) q = q.eq('featured', true)
  if (search)   q = q.textSearch('fts', search, { config: 'portuguese', type: 'plain' })

  const { data, error, count } = await q
  const durationMs = Date.now() - startTime

  if (error) {
    logRequest({ apiKey, request, statusCode: 500, durationMs })
    return apiError('Internal server error', 500)
  }

  logRequest({ apiKey, request, statusCode: 200, durationMs })

  const totalPages = count ? Math.ceil(count / limit) : 1
  return Response.json(
    { data, meta: { page, limit, total: count, total_pages: totalPages, has_more: page < totalPages } },
    { status: 200, headers: { ...corsHeaders('GET, OPTIONS'), ...rateLimitHeaders(apiKey, rateLimit.remaining, rateLimit.resetAt), 'X-Response-Time': `${durationMs}ms` } }
  )
}

// ─── POST /api/v1/ads ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  // Escrita usa service_role. A anon key não tem policy de INSERT em `ads`
  // (a policy exige auth.uid() = user_id, e aqui não há sessão de usuário),
  // então este insert falhava por RLS. A alternativa seria uma policy
  // `WITH CHECK (true)`, mas ela valeria para qualquer visitante do site —
  // a anon key está no bundle do browser. Ver
  // supabase/migrations/20260724_api_rls_fixes.sql.
  //
  // A autorização é da camada de aplicação: API key válida, permissão
  // write_ads, rate limit e o payload em allowlist montado abaixo.
  const supabase = getServiceClient()

  const auth = await authenticateApiKey(request)
  if (!auth.ok || !auth.apiKey) return apiError(auth.error!, auth.status!)
  const apiKey = auth.apiKey

  if (!hasPermission(apiKey, 'write_ads')) {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime })
    return apiError('Forbidden: this key does not have write_ads permission', 403)
  }

  // BUG MÉDIO CORRIGIDO (reteste do site, 2026-08-25): o campo "Ambiente"
  // (Sandbox/Produção) da chave era puramente cosmético — nenhuma rota
  // olhava pra ele, então uma chave marcada "Sandbox" criava anúncio real
  // de verdade em produção (confirmado ao vivo no reteste). Não existe
  // isolamento de dado real entre ambientes nesta base — a interpretação
  // mais segura sem isso é: chave sandbox nunca escreve, só lê.
  if (apiKey.environment === 'sandbox') {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime })
    return apiError('Forbidden: sandbox keys are read-only — writes always affect real production data', 403)
  }

  const rateLimit = await checkRateLimit(apiKey)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime })
    return apiError(`Rate limit exceeded. Retry after: ${rateLimit.resetAt}`, 429, { retry_after: rateLimit.resetAt })
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  // Required fields validation
  const required = ['title_pt', 'category_id', 'price', 'currency', 'country']
  for (const field of required) {
    if (!body[field]) {
      return apiError(`Missing required field: ${field}`, 400)
    }
  }

  // user_id: only full_access keys may specify an arbitrary user_id
  // Other keys must provide it but it is still required (the API key partner is responsible)
  if (!body.user_id) {
    return apiError('Missing required field: user_id', 400)
  }
  if (!apiKey.permissions.includes('full_access') && !apiKey.permissions.includes('write_ads')) {
    return apiError('Insufficient permissions to create ads', 403)
  }

  // Sanitize and build payload — only allow safe fields via API
  // Images and tags: sanitize each item to string to prevent object injection
  const safeImages = Array.isArray(body.images)
    ? body.images.slice(0, 10).map((img: unknown) => String(img))
    : []
  const safeTags = Array.isArray(body.tags_pt)
    ? body.tags_pt.slice(0, 20).map((t: unknown) => String(t))
    : []

  const payload = {
    title_pt:      String(body.title_pt).slice(0, 200),
    title_es:      body.title_es ? String(body.title_es).slice(0, 200) : null,
    description:   body.description ? String(body.description).slice(0, 5000) : null,
    price:         Number(body.price),
    currency:      String(body.currency || 'BRL').toUpperCase().slice(0, 3),
    price_unit_pt: body.price_unit_pt ? String(body.price_unit_pt).slice(0, 50) : null,
    negotiable:    Boolean(body.negotiable ?? false),
    condition:     body.condition ? String(body.condition).slice(0, 50) : null,
    category_id:   String(body.category_id).slice(0, 100),
    country:       String(body.country).slice(0, 2).toUpperCase(),
    state:         body.state ? String(body.state).slice(0, 50) : null,
    city:          body.city ? String(body.city).slice(0, 100) : null,
    location_text: body.location_text ? String(body.location_text).slice(0, 200) : null,
    images:        safeImages,
    tags_pt:       safeTags,
    video_url:     body.video_url ? String(body.video_url).slice(0, 500) : null,
    user_id:       String(body.user_id),
    status:        'active' as const,
  }

  // Validate price
  if (isNaN(payload.price) || payload.price < 0) {
    return apiError('Invalid price value', 400)
  }

  const { data, error } = await supabase.from('ads').insert(payload).select('id, title_pt, status, created_at').single()
  const durationMs = Date.now() - startTime

  if (error) {
    // Sanitize DB errors — never expose internal constraint/table names to API consumers
    const safeMsg = error.code === '23503' ? 'Invalid user_id or category_id: referenced record does not exist'
                  : error.code === '23505' ? 'Duplicate entry'
                  : error.code === '23514' ? 'Validation constraint failed'
                  : 'Failed to create ad'
    const safeStatus = error.code?.startsWith('23') ? 400 : 500
    logRequest({ apiKey, request, statusCode: safeStatus, durationMs })
    return apiError(safeMsg, safeStatus)
  }

  logRequest({ apiKey, request, statusCode: 201, durationMs })

  return Response.json(
    { data, message: 'Ad created successfully' },
    { status: 201, headers: { ...corsHeaders('GET, POST, OPTIONS'), ...rateLimitHeaders(apiKey, rateLimit.remaining, rateLimit.resetAt), 'X-Response-Time': `${durationMs}ms` } }
  )
}
