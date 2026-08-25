import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

// Preview de cupom pro CheckoutModal ("Aplicar cupom"): antes lia a tabela
// `coupons` direto com a anon key — parou de funcionar quando a RLS de
// coupons virou admin-only (revisão de regras de negócio, 2026-08-25: a
// mesma tabela permitia SELECT/INSERT/UPDATE/DELETE pra qualquer
// autenticado, incluindo criar o próprio cupom de 100% off). A validação
// que de fato vale (a que cobra) já era 100% server-side em
// app/api/checkout/route.ts — esta rota só repete essa checagem pra dar o
// preview visual, sem nunca expor `id`/`usage_count`/`max_uses` da tabela.
export async function POST(req: Request) {
  try {
    const { code } = await req.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Código obrigatório.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: coupon } = await supabase
      .from('coupons')
      .select('discount_type, discount_value, is_active, valid_until, usage_count, max_uses')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single()

    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Cupom inválido ou inativo.' })
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Cupom expirado.' })
    }
    if (coupon.max_uses && coupon.usage_count >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: 'Limite de usos atingido.' })
    }

    return NextResponse.json({
      valid: true,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
    })
  } catch (err: any) {
    console.error('[validate-coupon] Error:', err)
    return NextResponse.json({ valid: false, error: 'Erro interno.' }, { status: 500 })
  }
}
