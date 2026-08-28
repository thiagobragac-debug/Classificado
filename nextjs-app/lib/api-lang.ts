import { cookies } from 'next/headers'

// BUG CORRIGIDO (validação do zero, rodada 6): nenhuma rota de checkout
// (validate-coupon, checkout/init, checkout) era consciente de idioma — toda
// mensagem de erro (cupom inválido, "já tem este plano", falha de gateway,
// cartão recusado) voltava em português mesmo com tc_lang=es, e o cliente
// (CheckoutModal.tsx) sempre preferia a string crua do servidor à sua
// própria tradução local. Helper compartilhado pra ler o idioma ativo em
// Route Handlers (mesmo cookie tc_lang lido em Server Components via
// getCookieLang() em app/(public)/anuncio/[id]/page.tsx).
export async function getRequestLang(): Promise<'pt' | 'es'> {
  const cookieStore = await cookies()
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt'
}
