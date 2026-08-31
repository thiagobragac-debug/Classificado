import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { selectGateway, asaasAdapter, GatewayAdapter } from '@/lib/gateways'
import { resolverIpConfiavel } from '@/lib/ip-utils'
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): esta
// rota ficou fora da rodada de i18n/hardening de erro aplicada às outras 3
// rotas de checkout — toda mensagem era hardcoded (algumas em inglês) e o
// catch externo repassava err.message cru pro cliente (mesma classe de
// vazamento já corrigida nas outras 3). Hoje o CheckoutModal não chama esta
// rota (Asaas tokeniza via formulário próprio), mas é um endpoint HTTP
// público e funcional (testado contra o sandbox real da Asaas, ver
// docs/CHECKLIST-PRODUCAO.md) — fica com o mesmo bug no dia em que for
// conectado à UI se não for corrigido agora.
const ERRORS = {
  pt: {
    missingAuth: 'Cabeçalho de autorização ausente.',
    unauthorized: 'Não autorizado.',
    tooManyAttempts: 'Muitas tentativas. Aguarde um momento.',
    incompleteCard: 'Dados de cartão incompletos.',
    missingDocAddress: 'CPF/CNPJ e endereço de cobrança são obrigatórios.',
    asaasNotConfigured: 'Asaas não configurado. Contate o suporte.',
    wrongGateway: (gateway: string) => `Gateway '${gateway}' tokeniza cartão direto no cliente — não use esta rota para ele.`,
    notImplemented: (gateway: string) => `Gateway '${gateway}' não implementa tokenização via servidor.`,
    tokenizeFailed: 'Não foi possível processar os dados do cartão no momento. Verifique os dados ou tente novamente.',
    internal: 'Erro interno.',
  },
  es: {
    missingAuth: 'Falta el encabezado de autorización.',
    unauthorized: 'No autorizado.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento.',
    incompleteCard: 'Datos de tarjeta incompletos.',
    missingDocAddress: 'CPF/CNPJ y dirección de facturación son obligatorios.',
    asaasNotConfigured: 'Asaas no está configurado. Contacta al soporte.',
    wrongGateway: (gateway: string) => `El gateway '${gateway}' tokeniza la tarjeta directo en el cliente — no uses esta ruta para él.`,
    notImplemented: (gateway: string) => `El gateway '${gateway}' no implementa tokenización vía servidor.`,
    tokenizeFailed: 'No se pudieron procesar los datos de la tarjeta en este momento. Verifica los datos o inténtalo de nuevo.',
    internal: 'Error interno.',
  },
} as const

// Única rota em que dado de cartão em claro chega ao nosso servidor — e só
// porque a tokenização da Asaas exige a access_token secreta no header,
// tornando impossível tokenizar direto do navegador como Stripe Elements/MP
// Bricks/Pagar.me tokenizeCard.js fazem com uma chave pública. O cartão vive
// só na memória desta requisição: repassado à Asaas, nunca gravado no banco
// nem logado. Ver lib/gateways/types.ts (GatewayAdapter.tokenizeCard) e
// lib/gateways/asaas.ts.
//
// Gateways com tokenização client-side segura (Stripe, Mercado Pago,
// Pagar.me) não implementam tokenizeCard — devolvem 400 aqui de propósito,
// para deixar claro que o card não deveria estar chegando a este endpoint
// para esses gateways.
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

    // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): esta é a
    // ÚNICA rota que recebe PAN/CVV em claro — sem rate limit, vira um
    // oráculo de card-testing usando nossas próprias credenciais Asaas.
    // Limite mais apertado que /api/checkout por causa disso.
    const permitido = await dentroDoLimiteFallback({
      bucket: `tokenize_card_${user.id}`,
      limit: 5,
      logPrefix: 'tokenize-card',
      sensivel: true, // PAN/CVV em claro — alertar no Sentry se o fail-open disparar aqui
    })
    if (!permitido) {
      return NextResponse.json({ error: tx.tooManyAttempts }, { status: 429 })
    }

    const body = await req.json()
    const { creditCard, billingAddress, doc, phone } = body

    if (!creditCard?.number || !creditCard?.holderName || !creditCard?.expMonth || !creditCard?.expYear || !creditCard?.cvv) {
      return NextResponse.json({ error: tx.incompleteCard }, { status: 400 })
    }
    if (!billingAddress || !doc) {
      return NextResponse.json({ error: tx.missingDocAddress }, { status: 400 })
    }

    const { data: profile } = await supabase.from('profiles').select('country, name, display_name').eq('id', user.id).single()
    const userCountry: string | undefined = profile?.country || undefined

    const settings = await getSettings(supabase)
    const nationalDefault = settings['gateway_nacional_padrao'] || 'mercadopago'
    const internationalDefault = settings['gateway_internacional_padrao'] || 'stripe'
    const gatewayName = selectGateway(userCountry, nationalDefault, internationalDefault)

    let adapter: GatewayAdapter
    switch (gatewayName) {
      case 'asaas':
        if (!settings['asaas_api_key']) {
          return NextResponse.json({ error: tx.asaasNotConfigured }, { status: 503 })
        }
        adapter = asaasAdapter(
          settings['asaas_api_key'],
          (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'
        )
        break
      default:
        return NextResponse.json(
          { error: tx.wrongGateway(gatewayName) },
          { status: 400 }
        )
    }

    if (!adapter.tokenizeCard) {
      return NextResponse.json({ error: tx.notImplemented(gatewayName) }, { status: 501 })
    }

    const gatewayUser = {
      id: user.id,
      email: user.email!,
      name: profile?.display_name || profile?.name || user.email,
      country: userCountry,
    }
    // resolverIpConfiavel devolve null sem header confiável (dev local) —
    // tokenizeCard exige uma string (a Asaas marca remoteIp como
    // obrigatório), e este valor não vira chave de rate limit, então um
    // fallback fixo aqui não tem o problema de balde compartilhado que
    // tinha em proxy.ts/contact/route.ts.
    const ip = resolverIpConfiavel(req.headers) ?? '127.0.0.1'

    let gatewayToken: string
    try {
      gatewayToken = await adapter.tokenizeCard(gatewayUser, creditCard, billingAddress, doc, phone, ip)
    } catch (tokenizeErr: any) {
      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial):
      // erro cru do gateway (pode conter detalhe interno da Asaas) vazava
      // pro cliente via o catch externo — mesma classe já corrigida nas
      // outras 3 rotas de checkout, nunca replicada aqui.
      console.error('[Tokenize Card] Gateway error:', tokenizeErr.message)
      return NextResponse.json({ error: tx.tokenizeFailed }, { status: 502 })
    }

    return NextResponse.json({ token: gatewayToken })
  } catch (err: any) {
    console.error('[Tokenize Card] Error:', err)
    return NextResponse.json({ error: tx.internal }, { status: 500 })
  }
}
