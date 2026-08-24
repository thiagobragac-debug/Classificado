import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { selectGateway, asaasAdapter, GatewayAdapter } from '@/lib/gateways'
import { resolverIpConfiavel } from '@/lib/ip-utils'

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

    const body = await req.json()
    const { creditCard, billingAddress, doc, phone } = body

    if (!creditCard?.number || !creditCard?.holderName || !creditCard?.expMonth || !creditCard?.expYear || !creditCard?.cvv) {
      return NextResponse.json({ error: 'Dados de cartão incompletos.' }, { status: 400 })
    }
    if (!billingAddress || !doc) {
      return NextResponse.json({ error: 'CPF/CNPJ e endereço de cobrança são obrigatórios.' }, { status: 400 })
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
          return NextResponse.json({ error: 'Asaas não configurado. Contate o suporte.' }, { status: 503 })
        }
        adapter = asaasAdapter(
          settings['asaas_api_key'],
          (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'
        )
        break
      default:
        return NextResponse.json(
          { error: `Gateway '${gatewayName}' tokeniza cartão direto no cliente — não use esta rota para ele.` },
          { status: 400 }
        )
    }

    if (!adapter.tokenizeCard) {
      return NextResponse.json({ error: `Gateway '${gatewayName}' não implementa tokenização via servidor.` }, { status: 501 })
    }

    const gatewayUser = {
      id: user.id,
      email: user.email!,
      name: profile?.display_name || profile?.name || user.email,
      country: userCountry,
    }
    const ip = resolverIpConfiavel(req.headers)

    const gatewayToken = await adapter.tokenizeCard(gatewayUser, creditCard, billingAddress, doc, phone, ip)

    return NextResponse.json({ token: gatewayToken })
  } catch (err: any) {
    console.error('[Tokenize Card] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
