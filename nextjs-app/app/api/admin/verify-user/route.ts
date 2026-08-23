import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Concede ou remove o selo de verificação de um usuário.
//
// profiles.verified e profiles.kyc_status passaram a ser colunas privilegiadas
// (migration 20260822120400): só o service_role escreve nelas. O painel fazia
// esse update direto do browser com a anon key — o mesmo caminho que permitia
// a um usuário qualquer se autoverificar.
//
// Quando `requestId` vem junto, a solicitação de verificação correspondente é
// atualizada na mesma operação, mantendo os dois registros coerentes.

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  let body: { userId?: unknown; verified?: unknown; requestId?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { userId, verified, requestId, reason } = body

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: '`userId` é obrigatório' }, { status: 400 })
  }
  if (typeof verified !== 'boolean') {
    return NextResponse.json({ error: '`verified` deve ser boolean' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('profiles')
    .update({
      verified,
      kyc_status: verified ? 'approved' : 'rejected',
    })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (typeof requestId === 'string' && requestId) {
    const { error: reqError } = await admin
      .from('verification_requests')
      .update({
        status: verified ? 'approved' : 'rejected',
        reason: typeof reason === 'string' ? reason : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (reqError) {
      // O selo já foi aplicado; a solicitação ficar dessincronizada é ruim mas
      // não invalida a decisão. Reporta para o admin poder repetir.
      console.error('[verify-user] selo aplicado mas verification_request nao atualizada:', reqError.message)
      return NextResponse.json(
        { error: 'Selo aplicado, mas a solicitação não foi atualizada. Recarregue e tente novamente.' },
        { status: 502 }
      )
    }
  }

  return NextResponse.json({ success: true })
}
