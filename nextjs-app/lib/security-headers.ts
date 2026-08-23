// ============================================
//   TAUZE CLASS — Cabeçalhos de segurança
//   Fonte única, consumida por duas camadas.
// ============================================
//
// A duplicação de camadas é intencional:
//
//   next.config.ts → alcança TODOS os paths, inclusive os assets estáticos
//                    (/_next/static, /public) que o matcher do proxy exclui.
//   proxy.ts       → reaplica nas rotas dinâmicas e acrescenta por cima o
//                    Content-Security-Policy com nonce, que só pode ser
//                    gerado em tempo de requisição.
//
// A lista em si vive só aqui. Mantê-la escrita nos dois arquivos foi o que
// deixou os dois conjuntos divergirem durante a migração middleware → proxy.

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // 0 é o valor moderno recomendado: o filtro XSS legado dos browsers antigos
  // introduzia vulnerabilidades próprias. O CSP é a defesa real.
  { key: 'X-XSS-Protection', value: '0' },
  // payment=() desliga a Payment Request API. Se um dia forem habilitados
  // Apple Pay / Google Pay no Stripe, isto precisa virar:
  //   payment=(self "https://js.stripe.com")
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=()' },
];
