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

  let { userId, verified, requestId, reason } = body

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: '`userId` é obrigatório' }, { status: 400 })
  }
  if (typeof verified !== 'boolean') {
    return NextResponse.json({ error: '`verified` deve ser boolean' }, { status: 400 })
  }

  const admin = createAdminClient()

  // GAP CORRIGIDO: o toggle manual de selo em /admin/usuarios chama esta
  // rota sem requestId — sem isso, uma verification_requests pendente do
  // mesmo usuário ficava "pending" para sempre mesmo com o selo já
  // concedido/negado manualmente aqui. Resolvido no servidor (não na UI de
  // usuarios) pra valer pros dois pontos de entrada.
  if (typeof requestId !== 'string' || !requestId) {
    const { data: pending } = await admin
      .from('verification_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pending) requestId = pending.id
  }

  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): sem `.select()`, um
  // update que não afeta nenhuma linha (userId inexistente/já excluído,
  // corrida com outra ação) ainda respondia `{ success: true }` — o admin
  // via a UI como se o selo tivesse sido concedido/revogado quando nada
  // mudou no banco. Mesmo padrão já usado em subscriptions/cancel e na
  // página de api-keys para esta classe de operação.
  const { data: updatedProfiles, error } = await admin
    .from('profiles')
    .update({
      verified,
      kyc_status: verified ? 'approved' : 'rejected',
    })
    .eq('id', userId)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updatedProfiles || updatedProfiles.length === 0) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
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
