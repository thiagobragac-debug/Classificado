import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sendEmail, EmailNaoConfiguradoError } from '@/lib/send-email'

// Botão "Enviar e-mail de teste" da aba E-mail em /admin/configuracoes — lê a
// config JÁ SALVA (não os campos ainda não salvos no formulário, pra nunca
// precisar mandar um segredo de volta pro navegador só pra testar) e manda
// um e-mail de verificação pro próprio e-mail do admin logado.
async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }), user: null }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }), user: null }
  return { erro: null, user }
}

export async function POST() {
  const { erro, user } = await exigirAdmin()
  if (erro) return erro
  if (!user!.email) return NextResponse.json({ error: 'Sua conta de admin não tem e-mail cadastrado.' }, { status: 400 })

  try {
    await sendEmail({
      to: user!.email,
      subject: 'Teste de configuração — Tauze Class',
      text: 'Se você recebeu este e-mail, a configuração de envio está funcionando corretamente.',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof EmailNaoConfiguradoError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: (err as Error).message || 'Falha ao enviar e-mail de teste.' }, { status: 500 })
  }
}
