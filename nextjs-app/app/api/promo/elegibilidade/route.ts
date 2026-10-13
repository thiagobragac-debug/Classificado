import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback'
import { usuarioJaConsumiuPromo } from '@/lib/pricing/promo-elegibilidade'

// Informa à vitrine (/planos) se a promoção "50% OFF no primeiro ciclo" vale para
// o usuário logado -- F28 da auditoria de 12/out/2026. É só uma DICA de exibição:
// quem decide o preço cobrado é sempre /api/checkout (que aplica a mesma regra).
//
// Elegível = não tem assinatura ativa/em atraso (isso seria troca de plano, que
// nunca ganha a promoção) E nunca teve uma assinatura paga (a promoção é de
// aquisição, uma vez por usuário -- ver lib/pricing/promo-elegibilidade.ts).
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')

  const supabase = createAdminClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const permitido = await dentroDoLimiteFallback({ bucket: `promo_elegibilidade_${user.id}`, limit: 30, logPrefix: 'promo-elegibilidade' })
  if (!permitido) return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 })

  const { data: ativa } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['active', 'past_due'])
    .limit(1)
    .maybeSingle()
  if (ativa) return NextResponse.json({ elegivel: false })

  const jaConsumiu = await usuarioJaConsumiuPromo(supabase, user.id)
  return NextResponse.json({ elegivel: !jaConsumiu })
}
