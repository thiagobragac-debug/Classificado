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
  parsePagination,
} from '@/lib/api-auth'
import { flattenOne } from '@/lib/supabase'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders('GET, OPTIONS') })
}

// ─── GET /api/v1/users ────────────────────────────────────────────────────────
// Returns public profile data only — NO emails, passwords or sensitive data.
// Private fields (email, phone) are only returned for full_access keys.
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  // BUG CORRIGIDO (varredura de segurança): usava a anon key — depois que
  // profiles.phone_whatsapp foi revogado do papel "anon" (vazamento crítico
  // corrigido nesta mesma varredura), esta rota não conseguiria mais ler o
  // telefone nem pra chave full_access. A autorização de quem pode ver o
  // quê já é 100% da aplicação (permissão da chave), service_role é o
  // client certo.
  const supabase = getServiceClient()

  const auth = await authenticateApiKey(request)
  if (!auth.ok || !auth.apiKey) return apiError(auth.error!, auth.status!)
  const apiKey = auth.apiKey

  if (!hasPermission(apiKey, 'read_users')) {
    logRequest({ apiKey, request, statusCode: 403, durationMs: Date.now() - startTime })
    return apiError('Forbidden: this key does not have read_users permission', 403)
  }

  const rateLimit = await checkRateLimit(apiKey)
  if (!rateLimit.allowed) {
    logRequest({ apiKey, request, statusCode: 429, durationMs: Date.now() - startTime })
    return apiError(`Rate limit exceeded. Retry after: ${rateLimit.resetAt}`, 429, { retry_after: rateLimit.resetAt })
  }

  const { searchParams } = new URL(request.url)
  const country        = searchParams.get('country')
  const verifiedParam  = searchParams.get('verified')  // 'true' | null
  const plan           = searchParams.get('plan')
  const { page, limit, from, invalid } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 50 })
  if (invalid) {
    logRequest({ apiKey, request, statusCode: 400, durationMs: Date.now() - startTime })
    return apiError('Invalid page/limit parameter: must be a positive integer', 400)
  }

  // Public-safe fields — no email, no phone for non-full_access keys, and
  // never for a key marcada "sandbox" (auditoria de segurança, 2026-08-30:
  // "sandbox" só bloqueava escrita, não leitura de campo sensível).
  const isFullAccess = hasPermission(apiKey, 'full_access') && apiKey.environment !== 'sandbox'
  // BUG CORRIGIDO: `plan` não é coluna de `profiles` (vive em
  // `user_secrets`, ver várias correções equivalentes no admin) — todo
  // GET aqui falhava com 42703 (coluna inexistente), endpoint 100% quebrado
  // pra qualquer chave.
  //
  // BUG CORRIGIDO (revisão do diff): `!inner` só é necessário pra permitir
  // filtrar por `plan` (embed sem !inner não é filtrável no PostgREST) —
  // mas estava aplicado incondicionalmente, mesmo em requisições sem
  // ?plan=. Um INNER JOIN faz o Postgrest excluir da resposta E do `count`
  // qualquer profile sem linha em user_secrets (hoje nenhum, mas é
  // invariante de trigger, não constraint de banco — nada impede um drift
  // futuro) — um parceiro perderia usuários da paginação em silêncio, sem
  // erro, mesmo sem ter pedido filtro de plano nenhum. Só usa !inner quando
  // o filtro de fato vai ser aplicado.
  // BUG CORRIGIDO (fechamento pré-produção): phone_whatsapp mudou de
  // profiles pra user_secrets (migration 20260829130000, RLS self-only) —
  // service_role ignora RLS, então só o embed precisa acompanhar a coluna.
  const secretFields = isFullAccess ? 'plan, phone_whatsapp' : 'plan'
  const embed = plan ? `user_secrets!inner(${secretFields})` : `user_secrets(${secretFields})`
  const selectFields = `id, name, avatar_url, bio, country, state, city, verified, ads_count, created_at, banner_url, ${embed}`

  let q = supabase
    .from('profiles')
    .select(selectFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (country)               q = q.eq('country', country)
  if (verifiedParam === 'true') q = q.eq('verified', true)  // only filter when explicitly requested
  if (plan)                  q = q.eq('user_secrets.plan', plan)


  const { data, error, count } = await q
  const durationMs = Date.now() - startTime

  if (error) {
    logRequest({ apiKey, request, statusCode: 500, durationMs })
    return apiError('Internal server error', 500)
  }

  // Achata user_secrets.plan pro formato plano que a API sempre devolveu
  const flattened = (data || []).map((u: any) => ({
    ...u,
    plan: flattenOne(u.user_secrets)?.plan,
    phone_whatsapp: flattenOne(u.user_secrets)?.phone_whatsapp,
    user_secrets: undefined,
  }))

  logRequest({ apiKey, request, statusCode: 200, durationMs })

  const totalPages = count ? Math.ceil(count / limit) : 1
  return Response.json(
    {
      data: flattened,
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
