import { cookies } from 'next/headers'

// BUG CORRIGIDO (validação do zero, rodada 6): nenhuma rota de checkout
// (validate-coupon, checkout/init, checkout) era consciente de idioma — toda
// mensagem de erro (cupom inválido, "já tem este plano", falha de gateway,
// cartão recusado) voltava em português mesmo com tc_lang=es, e o cliente
// (CheckoutModal.tsx) sempre preferia a string crua do servidor à sua
// própria tradução local. Helper compartilhado pra ler o idioma ativo em
// Route Handlers (mesmo cookie tc_lang lido em Server Components via
// getCookieLang() em app/(public)/anuncio/[id]/page.tsx).
//
// NÃO SUBSTITUIR POR getLocale() (auditoria de SEO, achado revisado): à
// primeira vista parece duplicar lib/locale-server.ts::getLocale() — mas as
// duas existem por necessidade, não por descuido. getLocale() lê o header
// x-locale, setado por proxy.ts a partir do prefixo /es da URL. proxy.ts,
// porém, trata /api/** como um caso à parte (ver bloco
// `if (pathname.startsWith('/api'))`) e retorna ANTES do ponto onde x-locale
// é definido — nenhuma rota de API roda sob um prefixo /es (não faz sentido
// existir uma), então getLocale() chamado aqui sempre veria o header ausente
// e cairia silenciosamente em 'pt', mesmo para um usuário ES real. Ler o
// cookie tc_lang diretamente, como esta função já faz, é a fonte de verdade
// correta neste contexto específico — unificar as duas quebraria o i18n do
// checkout, não corrigiria uma divergência.
export async function getRequestLang(): Promise<'pt' | 'es'> {
  const cookieStore = await cookies()
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt'
}
