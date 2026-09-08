import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendEmail, EmailNaoConfiguradoError } from '@/lib/send-email'

// Botão "Enviar resposta" em /admin/mensagens-contato — dispara um e-mail de
// verdade pro remetente original (msg.email, nunca um endereço vindo do
// corpo da requisição — mesmo se o painel admin fosse comprometido via XSS,
// não dá pra usar esta rota como relay pra endereço arbitrário) e grava a
// resposta em contact_messages (histórico consultável, não só "marcado como
// respondida" — ver migration 20260907230000).
async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }), userId: null }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }), userId: null }
  return { erro: null, userId: user.id }
}

export async function POST(request: Request) {
  const { erro, userId } = await exigirAdmin()
  if (erro) return erro

  let body: { id?: unknown; reply?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const reply = typeof body.reply === 'string' ? body.reply.trim() : ''
  if (!id || reply.length < 5 || reply.length > 5000) {
    return NextResponse.json({ error: 'Resposta inválida (mínimo 5, máximo 5000 caracteres).' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: msg, error: findError } = await admin
    .from('contact_messages')
    .select('id, name, email, subject')
    .eq('id', id)
    .single()

  if (findError || !msg) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })

  try {
    await sendEmail({
      to: msg.email,
      subject: `Re: ${msg.subject}`,
      text: `Olá ${msg.name},\n\n${reply}\n\n— Equipe Tauze Class`,
    })
  } catch (err) {
    if (err instanceof EmailNaoConfiguradoError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: (err as Error).message || 'Falha ao enviar a resposta.' }, { status: 500 })
  }

  const agora = new Date().toISOString()
  const { error: updateError } = await admin
    .from('contact_messages')
    .update({ admin_reply: reply, replied_at: agora, replied_by: userId, status: 'resolved', resolved_at: agora })
    .eq('id', id)

  if (updateError) {
    // O e-mail já saiu — não falha a requisição por causa disso, mas loga
    // pro admin não achar que nada aconteceu.
    return NextResponse.json({ success: true, warning: 'E-mail enviado, mas houve erro ao salvar o histórico: ' + updateError.message })
  }

  return NextResponse.json({ success: true })
}
