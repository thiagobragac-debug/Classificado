import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Bloqueia/desbloqueia usuários.
//
// Precisa existir como rota de servidor por dois motivos:
//
//  1. is_blocked passou a ser coluna privilegiada (migration
//     20260822120000_user_secrets_privilege_guard.sql) — só o service_role
//     escreve nela. O painel fazia esse update direto do browser, o que a RLS
//     já barrava de qualquer forma (a policy de UPDATE exige auth.uid() = id,
//     ou seja, o admin só conseguiria bloquear a si mesmo).
//
//  2. Com is_blocked dentro do JWT, escrever a flag não basta: o token que o
//     usuário já tem em mãos continua dizendo is_blocked=false até expirar.
//     Revogamos as sessões para matar o refresh token na hora.

export async function POST(request: Request) {
  // ─── Quem está chamando é admin? ────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // ─── Payload ────────────────────────────────────────────────────
  let body: { userIds?: unknown; blocked?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { userIds, blocked } = body

  if (typeof blocked !== 'boolean') {
    return NextResponse.json({ error: '`blocked` deve ser boolean' }, { status: 400 })
  }
  if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: '`userIds` deve ser um array de strings não vazio' }, { status: 400 })
  }
  if (userIds.includes(user.id)) {
    return NextResponse.json({ error: 'Um admin não pode bloquear a si mesmo' }, { status: 400 })
  }

  // ─── Escrita + revogação ────────────────────────────────────────
  const admin = createAdminClient()

  const { error } = await admin
    .from('user_secrets')
    .update({ is_blocked: blocked })
    .in('id', userIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Ban nativo do GoTrue, espelhando a flag. É o que realmente corta o acesso:
  // o refresh token passa a ser rejeitado na hora e o login volta a falhar.
  // Sem isso, o JWT que o usuário já tem continuaria dizendo is_blocked=false
  // até expirar. `is_blocked` segue existindo porque a RLS de `ads` usa ela
  // para esconder os anúncios de quem foi bloqueado.
  const banFailures: string[] = []
  await Promise.all(
    userIds.map(async (id) => {
      const { error: banError } = await admin.auth.admin.updateUserById(id, {
        ban_duration: blocked ? '876000h' : 'none', // ~100 anos / sem ban
      })
      if (banError) banFailures.push(id)
    })
  )

  if (banFailures.length > 0) {
    console.error('[block-user] flag gravada mas ban não aplicado para:', banFailures.join(', '))
    return NextResponse.json(
      {
        error: 'Flag atualizada, mas o ban de autenticação falhou para alguns usuários. Eles seguem com sessão ativa.',
        failed: banFailures,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, updated: userIds.length })
}
