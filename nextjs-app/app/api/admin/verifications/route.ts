import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { flattenOne } from '@/lib/supabase'

const PAGE_SIZE = 10

// Lista solicitações de verificação (KYC) para o admin.
//
// BUG CORRIGIDO (fechamento pré-produção): a página fazia essa consulta
// direto do browser com getSupabase() (cliente anon/authenticated),
// embutindo profiles(phone_whatsapp) no embed. Isso funcionava só porque
// phone_whatsapp ainda tinha SELECT concedido a `authenticated` em profiles
// — exatamente o vazamento fechado pela migration 20260829130000 (telefone
// mudou pra user_secrets, RLS self-only). Com a coluna migrada, esta consulta
// pararia de trazer o telefone (ou falharia) para o admin. Mesmo padrão já
// usado por /api/admin/users e /api/admin/subscriptions: dado sensível
// cruzando usuários só sai por rota de servidor com service_role, depois de
// checar is_admin.
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Filtro por status para a fila (cards/seletor da tela) — só aceita os
  // valores conhecidos, senão ignora (equivale a "todos").
  const VALID_STATUSES = ['pending', 'approved', 'rejected']
  const statusParam = searchParams.get('status')
  const status = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : null

  const admin = createAdminClient()
  let query = admin
    .from('verification_requests')
    .select('*, profiles(name, display_name, user_secrets(phone_whatsapp))', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, count, error } = await query.range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const requests = (data || []).map((req: any) => ({
    ...req,
    profiles: req.profiles ? {
      ...req.profiles,
      phone_whatsapp: flattenOne(req.profiles.user_secrets)?.phone_whatsapp,
      user_secrets: undefined,
    } : null,
  }))

  return NextResponse.json({ requests, total: count ?? requests.length })
}
