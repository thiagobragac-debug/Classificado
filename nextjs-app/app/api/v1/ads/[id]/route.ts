import { NextRequest } from 'next/server'
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
import { flattenOne } from '@/lib/supabase'

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
  // BUG CORRIGIDO (varredura de segurança): usava a anon key pra ler o
  // anúncio — depois que profiles.phone_whatsapp foi revogado do papel
  // "anon" (vazamento crítico corrigido nesta mesma varredura), essa query
  // não conseguiria mais ler o telefone nem pra chave full_access. A
  // autorização de quem pode ver o quê já é 100% da aplicação (permissão
  // da chave, checada abaixo) — service_role é o client certo aqui.
  const supabase = getServiceClient()

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
  // BUG CORRIGIDO (varredura de segurança, vazamento de dados): incluía
  // phone_whatsapp pra QUALQUER chave com read_ads — o próprio endpoint de
  // listagem (GET /api/v1/ads) e /api/v1/users já tratam telefone como
  // campo restrito a full_access; este era o único que vazava sem essa
  // checagem.
  const isFullAccess = hasPermission(apiKey, 'full_access')
  // BUG CORRIGIDO (fechamento pré-produção): phone_whatsapp mudou de
  // profiles pra user_secrets (migration 20260829130000, RLS self-only) —
  // service_role ignora RLS, então só o embed precisa acompanhar a coluna.
  const profileFields = isFullAccess
    ? 'id, name, avatar_url, verified, user_secrets(phone_whatsapp)'
    : 'id, name, avatar_url, verified'
  const { data: rawData, error } = await supabase
    .from('ads')
    .select(
      `id, title_pt, title_es, description, price, currency, price_unit_pt, negotiable, condition, status, featured, images, category_id, city, state, country, location_text, video_url, tags_pt, views_count, created_at, updated_at, expires_at, profiles!user_id(${profileFields})`
    )
    .eq('id', id)
    .eq('status', 'active')
    .single()

  const durationMs = Date.now() - startTime

  if (error || !rawData) {
    logRequest({ apiKey, request, statusCode: 404, durationMs })
    return apiError('Ad not found or not active', 404)
  }

  const rawProfile = Array.isArray(rawData.profiles) ? rawData.profiles[0] : rawData.profiles
  const data = {
    ...rawData,
    profiles: rawProfile && isFullAccess ? {
      ...rawProfile,
      phone_whatsapp: flattenOne((rawProfile as any).user_secrets)?.phone_whatsapp,
      user_secrets: undefined,
    } : rawProfile,
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
