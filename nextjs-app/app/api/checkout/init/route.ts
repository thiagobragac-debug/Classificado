import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { selectGateway } from '@/lib/gateways'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6): toda mensagem de erro desta
// rota voltava em português (ou em inglês, no caso da auth) regardless do
// idioma ativo — `country`, que decide se o fluxo Stripe é alcançado, é
// editável pelo próprio usuário no perfil, então isto é facilmente
// alcançável por qualquer usuário em espanhol.
const ERRORS = {
  pt: {
    missingAuth: 'Cabeçalho de autorização ausente.',
    unauthorized: 'Não autorizado.',
    stripeNotConfigured: 'Stripe não configurado.',
    mpNotConfigured: 'Mercado Pago não configurado.',
    stripeInitFailed: 'Não foi possível iniciar o checkout no momento. Tente novamente ou contate o suporte.',
    internal: 'Erro interno. Tente novamente.',
  },
  es: {
    missingAuth: 'Falta el encabezado de autorización.',
    unauthorized: 'No autorizado.',
    stripeNotConfigured: 'Stripe no está configurado.',
    mpNotConfigured: 'Mercado Pago no está configurado.',
    stripeInitFailed: 'No se pudo iniciar el checkout en este momento. Inténtalo de nuevo o contacta al soporte.',
    internal: 'Error interno. Inténtalo de nuevo.',
  },
} as const

export async function POST(req: Request) {
  const lang = await getRequestLang()
  const tx = ERRORS[lang]
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: tx.missingAuth }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: tx.unauthorized }, { status: 401 })
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
        return NextResponse.json({ error: tx.stripeNotConfigured }, { status: 503 })
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
        // BUG CORRIGIDO (validação do zero, rodada 6): o corpo cru da
        // resposta de erro da Stripe (pode incluir request_log_url e detalhe
        // interno) ia direto pro client via err.message no catch externo —
        // pior ainda, `country` (que decide se cai neste branch Stripe) é
        // editável pelo próprio usuário no perfil, então não precisa nem
        // forjar requisição pra alcançar esse caminho. Loga o detalhe
        // completo só no servidor; devolve mensagem genérica.
        console.error('[Checkout Init] Stripe setup_intents falhou:', await siRes.text())
        return NextResponse.json({ error: tx.stripeInitFailed }, { status: 502 })
      }
      const setupIntent = await siRes.json()
      clientSecret = setupIntent.client_secret
    } else if (gatewayName === 'mercadopago') {
      publicKey = settings['mp_public_key'] || ''
      if (!publicKey) {
        return NextResponse.json({ error: tx.mpNotConfigured }, { status: 503 })
      }
    }

    return NextResponse.json({
      gateway: gatewayName,
      publicKey,
      clientSecret
    })
  } catch (err: any) {
    // BUG CORRIGIDO (validação do zero, rodada 6): err.message cru (pode
    // conter detalhe interno de gateway/banco) ia direto pro cliente aqui —
    // mesma classe de vazamento já corrigida no ponto específico da Stripe
    // acima, endurecida aqui também como rede de segurança final.
    console.error('[Checkout Init] Error:', err)
    return NextResponse.json({ error: tx.internal }, { status: 500 })
  }
}
