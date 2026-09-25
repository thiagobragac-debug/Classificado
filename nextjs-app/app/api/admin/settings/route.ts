import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { SECRET_SETTING_KEYS } from '@/lib/secret-settings'
import { isForbiddenOrigin } from '@/lib/csrf-origin'
import { logAdminAction } from '@/lib/admin-audit'

// Leitura e escrita de platform_settings pelo painel administrativo.
//
// Antes o painel falava direto com o PostgREST usando a anon key: um
// `select('*')` no carregamento e um `upsert` no salvamento. Como o admin
// autenticado enxerga as chaves secretas, stripe_secret_key, mp_access_token e
// pagarme_api_key eram entregues ao navegador dele em toda abertura da tela —
// ficavam na resposta de rede, no estado do React e em qualquer HAR exportado.
// Um XSS no painel, ou uma extensão hostil, entregaria os gateways inteiros.
//
// Aqui os segredos nunca saem do servidor: a leitura devolve apenas se estão
// preenchidos, e a escrita aceita valor novo sem nunca ter mostrado o antigo.

// Lista compartilhada com components/Header.tsx (lib/secret-settings.ts) —
// se uma chave secreta nova for criada, precisa entrar lá, não só aqui.
const CHAVES_SECRETAS = new Set<string>(SECRET_SETTING_KEYS)

// Sentinela para apagar um segredo de propósito — sem ela não haveria como
// distinguir "não mexi neste campo" de "quero limpar".
const LIMPAR = '__LIMPAR__'

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }), supabase: null }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }), supabase: null }
  }
  return { erro: null, supabase }
}

export async function GET() {
  const { erro } = await exigirAdmin()
  if (erro) return erro

  const admin = createAdminClient()
  const { data, error } = await admin.from('platform_settings').select('key, value')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, string> = {}
  const secretasPreenchidas: string[] = []

  for (const { key, value } of data ?? []) {
    if (CHAVES_SECRETAS.has(key)) {
      // O valor nunca vai para o cliente. Só o fato de existir.
      settings[key] = ''
      if (value) secretasPreenchidas.push(key)
    } else {
      settings[key] = value ?? ''
    }
  }

  return NextResponse.json({
    settings,
    chavesSecretas: [...CHAVES_SECRETAS],
    secretasPreenchidas,
  })
}

export async function POST(request: Request) {
  // BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
  // 2026-09-24): ver comentário em lib/csrf-origin.ts — esta rota grava as
  // chaves secretas dos gateways de pagamento, a mais privilegiada de
  // todas as rotas admin.
  if (isForbiddenOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { erro, supabase } = await exigirAdmin()
  if (erro) return erro

  let body: { settings?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const entrada = body.settings
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return NextResponse.json({ error: '`settings` deve ser um objeto' }, { status: 400 })
  }

  const agora = new Date().toISOString()
  const updates: { key: string; value: string; updated_at: string }[] = []

  for (const [key, valorBruto] of Object.entries(entrada as Record<string, unknown>)) {
    if (typeof valorBruto !== 'string') continue

    if (CHAVES_SECRETAS.has(key)) {
      // Campo em branco significa "não mexi": o painel nunca recebeu o valor
      // atual, então salvar o formulário não pode apagar o segredo.
      if (valorBruto === '') continue
      updates.push({ key, value: valorBruto === LIMPAR ? '' : valorBruto, updated_at: agora })
    } else {
      updates.push({ key, value: valorBruto, updated_at: agora })
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ success: true, updated: 0 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('platform_settings').upsert(updates, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalida getServerAdsenseClientId (lib/supabase-server.ts) — sem isso,
  // uma troca de adsense_client_id só apareceria pros visitantes depois de
  // até 1h (o revalidate: 3600 do unstable_cache). BUG CORRIGIDO (achado ao
  // vivo rodando `next build` local, independente do cacheComponents):
  // revalidateTag() nesta versão do Next (16.3.4) sempre exige um 2º
  // argumento (perfil de cache) na assinatura de tipos — ver
  // node_modules/next/dist/server/web/spec-extension/revalidate.d.ts.
  // Chamada de 1 argumento só nunca quebrou o deploy porque nem CI
  // (tsc --noEmit) nem o build local tinham sido rodados depois do commit
  // que introduziu essa linha — só `next dev` (que não type-checa).
  revalidateTag('platform-settings', 'max')

  // BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25):
  // ver lib/admin-audit.ts — nenhuma ação admin registrava quem fez o quê.
  // NUNCA loga o valor em si (details só tem os nomes das chaves alteradas
  // e se cada uma era secreta) — o log de auditoria não pode virar mais um
  // lugar onde um segredo de gateway vaza.
  if (supabase) {
    await logAdminAction(supabase, 'update_platform_settings', 'platform_settings', null, {
      keys: updates.map(u => ({ key: u.key, secret: CHAVES_SECRETAS.has(u.key) })),
    })
  }

  // RESOLVIDO (confirmado ao vivo contra o painel real da Pagar.me,
  // 2026-09-02 — ver comentário em lib/gateways/pagarme.ts::validateWebhook):
  // o mecanismo real é Basic Auth (usuário/senha cadastrados no painel deles),
  // não HMAC. pagarme_webhook_secret agora é validado nesse formato; o aviso
  // que existia aqui (pedindo pra não preencher até confirmar) não se aplica
  // mais.
  const preencheuSecretPagarmeSemDoisPontos = updates.some(
    u => u.key === 'pagarme_webhook_secret' && u.value !== '' && !u.value.includes(':')
  )
  if (preencheuSecretPagarmeSemDoisPontos) {
    console.warn(
      "[admin/settings] pagarme_webhook_secret foi preenchido sem o formato esperado 'usuario:senha' " +
      '(Basic Auth do painel de webhooks da Pagar.me) — webhooks reais serão rejeitados até corrigir.'
    )
  }

  return NextResponse.json({ success: true, updated: updates.length })
}
