import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

// BUG CORRIGIDO (achado ao vivo tentando verificar a remoção de "Suporte VIP
// 24/7" do plano Premium): admin/planos/page.tsx salva direto via
// supabase.from('plans').update(...) no cliente — não existe nenhum
// revalidatePath/revalidateTag no repo inteiro. A pagina publica /planos usa
// `next: { revalidate: 3600 }` (ISR por tempo), entao qualquer edicao de
// plano no admin ficava ate 1h sem aparecer pro publico, sem nenhum aviso.
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

export async function POST() {
  const { erro } = await exigirAdmin()
  if (erro) return erro

  // /es/planos é a mesma page.tsx servida via rewrite (proxy.ts) — invalida
  // os dois caminhos externos por segurança, já que o cache do Next pode
  // tratá-los como entradas distintas dependendo de como o rewrite preserva
  // o path original.
  revalidatePath('/planos')
  revalidatePath('/es/planos')

  return NextResponse.json({ success: true })
}
