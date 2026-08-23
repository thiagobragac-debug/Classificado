import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Convida um usuário por e-mail.
//
// Esta rota NÃO tinha autenticação nenhuma: qualquer pessoa podia fazer POST
// com um e-mail arbitrário e o servidor disparava um convite do Supabase
// usando a service_role key. Na prática era um relay de e-mail aberto em nome
// do domínio — spam, queima de reputação de envio, estouro da cota de e-mails
// do projeto e criação de convites indesejados.
//
// Agora exige sessão válida + is_admin, checado no servidor.

export async function POST(request: Request) {
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

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { email } = body
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, user: data.user })
}
