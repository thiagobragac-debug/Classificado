import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6): toda mensagem desta rota
// voltava em português regardless do idioma ativo (tc_lang) — o
// CheckoutModal sempre prefere data.error (quando presente) à sua própria
// tradução local, então um usuário em espanhol via erro de cupom em
// português no momento mais crítico do checkout.
const ERRORS = {
  pt: {
    codeRequired: 'Código obrigatório.',
    notAuthenticated: 'Não autenticado.',
    tooManyAttempts: 'Muitas tentativas. Aguarde um momento.',
    invalidOrInactive: 'Cupom inválido ou inativo.',
    expired: 'Cupom expirado.',
    usageLimitReached: 'Limite de usos atingido.',
    internal: 'Erro interno.',
  },
  es: {
    codeRequired: 'Código obligatorio.',
    notAuthenticated: 'No autenticado.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento.',
    invalidOrInactive: 'Cupón inválido o inactivo.',
    expired: 'Cupón vencido.',
    usageLimitReached: 'Límite de usos alcanzado.',
    internal: 'Error interno.',
  },
} as const

// Preview de cupom pro CheckoutModal ("Aplicar cupom"): antes lia a tabela
// `coupons` direto com a anon key — parou de funcionar quando a RLS de
// coupons virou admin-only (revisão de regras de negócio, 2026-08-25: a
// mesma tabela permitia SELECT/INSERT/UPDATE/DELETE pra qualquer
// autenticado, incluindo criar o próprio cupom de 100% off). A validação
// que de fato vale (a que cobra) já era 100% server-side em
// app/api/checkout/route.ts — esta rota só repete essa checagem pra dar o
// preview visual, sem nunca expor `id`/`usage_count`/`max_uses` da tabela.
//
// GAP CORRIGIDO (3ª varredura de pré-lançamento): esta rota ia direto de
// req.json() pra uma query com createAdminClient() (service role, ignora
// RLS) sem autenticação nem rate limit — 25 requisições seguidas em
// sequência, todas 200, permitindo enumerar/testar códigos de cupom sem
// limite. proxy.ts só cobre /login e /auth (~linhas 224-245), nada de
// /api/* — cada rota precisa da própria proteção.
//
// Mesmo padrão de auth+rate limit de app/api/checkout/route.ts
// (check_rate_limit, RPC com janela no Postgres), mas com uma diferença
// deliberada: checkout/route.ts autentica via header Authorization: Bearer
// (CheckoutModal manda `session.access_token` explicitamente pra essa
// rota). Esta rota é chamada pelo CheckoutModal com um fetch simples,
// same-origin, sem esse header — só com os cookies de sessão. Autenticar
// via Bearer aqui quebraria a validação de cupom em produção (sempre
// 401), então usa-se o client de cookies (createClient(), o mesmo padrão
// de app/api/contact-seller/route.ts) para pegar o usuário da sessão.
export async function POST(req: Request) {
  const lang = await getRequestLang()
  const tx = ERRORS[lang]
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: tx.codeRequired }, { status: 400 })
    }

    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ valid: false, error: tx.notAuthenticated }, { status: 401 })
    }

    // Limite mais folgado que /api/checkout (10/60s): errar o código do
    // cupom algumas vezes é uso legítimo — o objetivo aqui é barrar
    // força-bruta automatizada, não atrapalhar quem digita errado.
    const { data: dentroDoLimite } = await authClient.rpc('check_rate_limit', {
      p_bucket: `validate_coupon_${user.id}`,
      p_limit: 20,
      p_window_seconds: 60,
    })
    if (dentroDoLimite === false) {
      return NextResponse.json({ valid: false, error: tx.tooManyAttempts }, { status: 429 })
    }

    const supabase = createAdminClient()
    const { data: coupon } = await supabase
      .from('coupons')
      .select('discount_type, discount_value, is_active, valid_until, usage_count, max_uses')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single()

    if (!coupon) {
      return NextResponse.json({ valid: false, error: tx.invalidOrInactive })
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return NextResponse.json({ valid: false, error: tx.expired })
    }
    if (coupon.max_uses && coupon.usage_count >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: tx.usageLimitReached })
    }

    return NextResponse.json({
      valid: true,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
    })
  } catch (err: any) {
    console.error('[validate-coupon] Error:', err)
    return NextResponse.json({ valid: false, error: tx.internal }, { status: 500 })
  }
}
