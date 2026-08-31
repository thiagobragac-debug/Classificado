import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { SECRET_SETTING_KEYS } from '@/lib/secret-settings'

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
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { erro: null }
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
  const { erro } = await exigirAdmin()
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

  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): lib/gateways/pagarme.ts
  // implementa validateWebhook seguindo um esquema (x-hub-signature) que uma
  // varredura extensiva não confirmou em nenhuma documentação oficial do
  // Pagar.me — hoje é inofensivo porque o secret vem vazio (fail-closed
  // rejeita tudo), mas se um admin preencher este campo pensando estar só
  // "completando a configuração", o app passa a mostrar "configurado" na UI
  // enquanto rejeita silenciosamente 100% dos webhooks reais do Pagar.me.
  // Aviso no servidor no momento exato em que alguém preenche o campo —
  // ainda não é uma alteração na UI, mas fica registrado no log de deploy.
  const preencheuSecretPagarmeNaoConfirmado = updates.some(
    u => u.key === 'pagarme_webhook_secret' && u.value !== ''
  )
  if (preencheuSecretPagarmeNaoConfirmado) {
    console.warn(
      '[admin/settings] pagarme_webhook_secret foi preenchido, mas o esquema de assinatura de webhook do Pagar.me ' +
      '(lib/gateways/pagarme.ts) não foi confirmado contra a documentação oficial nem testado com um webhook real. ' +
      'Confirme com o dashboard/suporte do Pagar.me antes de considerar este gateway ativo em produção — ver comentário em lib/gateways/pagarme.ts.'
    )
  }

  return NextResponse.json({ success: true, updated: updates.length })
}
