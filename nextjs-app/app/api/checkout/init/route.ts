import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { selectGateway } from '@/lib/gateways'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('country').eq('id', user.id).single()
    const userCountry = profile?.country || undefined

    const settings = await getSettings(supabase)
    const nationalDefault = settings['gateway_nacional_padrao'] || 'mercadopago'
    const internationalDefault = settings['gateway_internacional_padrao'] || 'stripe'

    const gatewayName = selectGateway(userCountry, nationalDefault, internationalDefault)
    
    let publicKey = ''
    let clientSecret = ''

    if (gatewayName === 'stripe') {
      const secretKey = settings['stripe_secret_key']
      // BUG CORRIGIDO: a página de admin (app/(admin)/admin/configuracoes)
      // salva a chave publicável em 'stripe_pub_key' — era essa a linha
      // que já existia preenchida em produção. Esta rota lia
      // 'stripe_public_key', um nome diferente, sempre undefined. Resultado:
      // secretKey vinha certo mas publicKey ficava sempre vazio, e a
      // condição abaixo devolvia 503 em toda tentativa de checkout via
      // Stripe — mesmo com as duas chaves corretamente configuradas no
      // admin. Mercado Pago (mp_public_key) e Pagar.me (pagarme_pub_key) não
      // tinham essa divergência entre o nome salvo e o nome lido.
      publicKey = settings['stripe_pub_key'] || ''
      if (!secretKey || !publicKey) {
        return NextResponse.json({ error: 'Stripe keys not configuradas.' }, { status: 503 })
      }
      
      // Create SetupIntent for Stripe Elements
      const siParams = new URLSearchParams()
      siParams.append('usage', 'off_session')
      
      const siRes = await fetch('https://api.stripe.com/v1/setup_intents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: siParams.toString()
      })
      
      if (!siRes.ok) {
        throw new Error(`Stripe erro ao iniciar: ${await siRes.text()}`)
      }
      const setupIntent = await siRes.json()
      clientSecret = setupIntent.client_secret
    } else if (gatewayName === 'mercadopago') {
      publicKey = settings['mp_public_key'] || ''
      if (!publicKey) {
        return NextResponse.json({ error: 'Mercado Pago public key not configurada.' }, { status: 503 })
      }
    }

    return NextResponse.json({
      gateway: gatewayName,
      publicKey,
      clientSecret
    })
  } catch (err: any) {
    console.error('[Checkout Init] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
