import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAnonClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';
import { SECURITY_HEADERS } from '@/lib/security-headers';
import { resolverIpConfiavel, ipParaRateLimit } from '@/lib/ip-utils';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Rate Limiting ─────────────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
let ratelimit: Ratelimit | null = null;

if (redisUrl && redisToken) {
  ratelimit = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    analytics: false,
  });
} else if (process.env.NODE_ENV === 'production') {
  console.info(
    '[proxy] Upstash não configurado — rate limiting de /login e /auth usando a janela no Postgres.'
  );
}

// Fallback no banco, para quando não há Redis. Antes disso, a ausência do
// Upstash simplesmente desligava o rate limiting: o objeto Ratelimit não era
// criado e o bloco virava no-op, deixando /login sem proteção contra força
// bruta. Contador em memória não serviria — em serverless cada instância teria
// o próprio, e bastaria ao atacante cair em instâncias diferentes.
// Ver supabase/migrations/20260822120500_rate_limit_no_banco.sql
const LIMITE_TENTATIVAS = 30;
const JANELA_SEGUNDOS = 60;

// resolverIpConfiavel vive em lib/ip-utils.ts, testada em
// lib/ip-utils.test.ts. Extraída daqui porque a mesma lógica de "não confiar
// no primeiro item do x-forwarded-for" (ver histórico do git) também existia
// duplicada, com bug próprio, em app/(public)/api/geoip/route.ts.

async function dentroDoLimite(chave: string): Promise<boolean> {
  if (ratelimit) {
    const { success } = await ratelimit.limit(chave);
    return success;
  }

  return dentroDoLimiteFallback({
    bucket: chave,
    limit: LIMITE_TENTATIVAS,
    windowSeconds: JANELA_SEGUNDOS,
    logPrefix: 'proxy',
  });
}

// ─── Host do Supabase (usado no CSP) ───────────────────────────
// Resolvido uma vez no boot. Se a env faltar, o CSP sai sem o host em vez de
// estourar `new URL('')` a cada requisição e derrubar todas as rotas.
const SUPABASE_HOST = (() => {
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    console.error('[proxy] NEXT_PUBLIC_SUPABASE_URL ausente ou inválida — CSP sairá sem o host do Supabase.');
    return '';
  }
})();

// ─── Allowlist de terceiros do CSP ─────────────────────────────
// Cada host existe por um motivo concreto; remover um quebra a feature
// correspondente em produção e o sintoma só aparece no console do browser.
//
// Gateways: o CheckoutModal carrega Stripe Elements e o Brick do Mercado Pago
// no cliente — ambos injetam script próprio e renderizam os campos de cartão
// em <iframe>. Pagar.me e Asaas não entram aqui: rodam apenas no servidor.
const STRIPE_SCRIPT = ['https://js.stripe.com', 'https://m.stripe.network'];
const STRIPE_FRAME = ['https://js.stripe.com', 'https://hooks.stripe.com', 'https://m.stripe.network'];
const STRIPE_CONNECT = ['https://api.stripe.com', 'https://m.stripe.com', 'https://m.stripe.network'];

const MP_SCRIPT = ['https://sdk.mercadopago.com', 'https://http2.mlstatic.com'];
const MP_FRAME = ['https://*.mercadopago.com', 'https://*.mercadolibre.com'];
// GAP DE INTEGRAÇÃO CORRIGIDO (auditoria completa, 2026-08-25): depois de
// liberar o script inline de bootstrap do Brick (ver isCheckoutRoute em
// buildCsp), ele passou a rodar e disparar chamadas de fingerprinting
// antifraude (device fingerprint / cookie de sessão) pra esses domínios —
// bloqueadas por connect-src/img-src, deixando o Brick sem inicializar do
// mesmo jeito, só que num ponto mais adiante do fluxo.
const MP_ANTIFRAUDE = ['https://*.mercadolibre.com', 'https://*.mercadolivre.com'];
// BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): faltava
// http2.mlstatic.com aqui. O Brick de cartão (@mercadopago/sdk-react) busca
// seu JSON de i18n desse host via fetch() no navegador — sem ele em
// connect-src, o browser bloqueia a chamada por CSP e o Bricks.create()
// falha silenciosamente, deixando a tela de checkout sem NENHUM campo de
// cartão. mlstatic já estava liberado em script-src e img-src, só faltava
// aqui — checkout por cartão via Mercado Pago (gateway nacional ativo) não
// funcionava para nenhum usuário real até esta correção.
const MP_CONNECT = ['https://api.mercadopago.com', 'https://api.mercadolibre.com', 'https://events.mercadopago.com', 'https://http2.mlstatic.com', ...MP_ANTIFRAUDE];

// BUG CRÍTICO CORRIGIDO (achado testando o formulário novo da Pagar.me no
// navegador real, 2026-09-02 — mesma classe do bug do MP_CONNECT acima, só
// que pra Pagar.me): CheckoutModal.tsx::handlePagarmeCardSubmit tokeniza o
// cartão chamando api.pagar.me DIRETO do navegador (só com a public_key,
// nunca a secret — ver comentário em pagarme.ts). Sem este host em
// connect-src, o fetch() era bloqueado pelo próprio CSP do site antes de
// sair — "Failed to fetch" pro usuário, sem nenhuma chamada de rede chegando
// a sair do browser. Reproduzido ao vivo: console mostrava o bloqueio de CSP
// explicitamente ("Refused to connect... violates the document's Content
// Security Policy").
const PAGARME_CONNECT = ['https://api.pagar.me'];

// Rotas onde o CheckoutModal roda (Card Payment Brick da Mercado Pago) — a
// única exceção à política de script-src baseada em nonce, ver comentário
// em buildCsp() abaixo.
const CHECKOUT_ROUTES = ['/planos'];

// ─── CSP Builder ───────────────────────────────────────────────
function buildCsp(nonce: string, pathname: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const supabaseHttp = SUPABASE_HOST ? [`https://${SUPABASE_HOST}`] : [];
  const supabaseWs = SUPABASE_HOST ? [`wss://${SUPABASE_HOST}`] : [];

  const directive = (name: string, values: string[]) => `${name} ${values.join(' ')}`;

  // GAP DE INTEGRAÇÃO CORRIGIDO (auditoria completa, 2026-08-25): o Card
  // Payment Brick do Mercado Pago (usado só nesta rota, via CheckoutModal)
  // injeta um <script> inline PRÓPRIO durante a inicialização (bootstrap de
  // cookie/Storage Access API — os campos de cartão em si já rodam isolados
  // num iframe da própria Mercado Pago, com o CSP deles, não o nosso) sem
  // carregar o nonce por requisição desta página. É uma lacuna reconhecida
  // e não resolvida do SDK deles (sem workaround oficial, confirmado na
  // documentação e no repositório deles) — e não dá pra usar um hash
  // fixo no lugar do nonce: o conteúdo desse script muda a cada sessão
  // (mesmo tamanho, hash diferente em cada carregamento, confirmado ao
  // vivo), então 'sha256-...' nunca bateria pro próximo usuário.
  //
  // Correção: só NESTA rota, o script-src abre mão do nonce (permitindo
  // 'unsafe-inline') — o resto do site inteiro continua exatamente com a
  // mesma política estrita baseada em nonce de sempre. É a forma padrão de
  // isolar uma dependência de terceiro que não suporta nonce, sem
  // enfraquecer a proteção nas páginas que não precisam dela.
  const isCheckoutRoute = CHECKOUT_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`));

  return [
    `default-src 'self'`,
    // nonce obrigatório para scripts inline do Next.js (hydration) — exceto
    // na(s) rota(s) de checkout, ver comentário acima.
    directive('script-src', [
      `'self'`,
      ...(isCheckoutRoute ? [`'unsafe-inline'`] : [`'nonce-${nonce}'`]),
      'https://cdn.jsdelivr.net',
      ...STRIPE_SCRIPT,
      ...MP_SCRIPT,
      // Turbopack / React Refresh precisam de eval apenas em desenvolvimento
      ...(isProd ? [] : [`'unsafe-eval'`]),
    ]),
    // CSS inline é aceitável (sem vetor de execução de código)
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    // Imagens: self + Supabase Storage + avatares Google + base64 + CDNs em uso
    directive('img-src', [
      `'self'`,
      'data:',
      'blob:',
      ...supabaseHttp,
      'https://lh3.googleusercontent.com',
      'https://flagcdn.com',
      'https://images.unsplash.com',
      'https://placehold.co',
      'https://*.stripe.com',
      'https://http2.mlstatic.com',
      ...MP_ANTIFRAUDE,
      // BUG CORRIGIDO (achado ao vivo testando o GA4 com Measurement ID
      // real pela 1ª vez — NEXT_PUBLIC_GA_MEASUREMENT_ID nunca tinha sido
      // configurado até agora, então este bloqueio nunca tinha aparecido).
      // gtag.js usa um beacon de imagem (googletagmanager.com/td?...) como
      // parte do rastreamento, além do fetch/sendBeacon já coberto por
      // connect-src — são diretivas de CSP diferentes; liberar só
      // connect-src (já feito) não bastava, o <img> do beacon continuava
      // bloqueado e o evento se perdia, sem erro visível pro usuário.
      'https://www.googletagmanager.com',
    ]),
    // Fontes
    `font-src 'self' data: https://fonts.gstatic.com`,
    // Conexões fetch/XHR/WebSocket feitas pelo browser
    directive('connect-src', [
      `'self'`,
      ...supabaseHttp,
      ...supabaseWs,
      'https://ipapi.co',                     // useGeoLocation
      'https://viacep.com.br',                // autocompletar CEP (ProfileTab)
      'https://nominatim.openstreetmap.org',  // geocodificação reversa (StepLocation)
      ...STRIPE_CONNECT,
      ...MP_CONNECT,
      ...PAGARME_CONNECT,
      // BUG CORRIGIDO (auditoria de SEO, 2ª rodada): GA4 (app/(public)/
      // layout.tsx, carregado só se NEXT_PUBLIC_GA_MEASUREMENT_ID existir)
      // usa nonce pra passar em script-src, mas o beacon de medição em si
      // é um fetch/sendBeacon — isso é connect-src, o nonce não cobre.
      // Sem esses hosts aqui, o script carregaria mas todo evento seria
      // bloqueado em silêncio pelo CSP assim que alguém configurar a env
      // var, dando a falsa impressão de que o analytics "não funciona".
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://www.googletagmanager.com',
    ]),
    // Frames: YouTube (leilões ao vivo) + iframes de cartão dos gateways
    directive('frame-src', ['https://www.youtube.com', ...STRIPE_FRAME, ...MP_FRAME]),
    `frame-ancestors 'none'`,
    // Bloquear plugins e object injection
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Service Worker
    `worker-src 'self'`,
    `manifest-src 'self'`,
  ].join('; ');
}

// ─── Aplicação dos cabeçalhos ──────────────────────────────────
function applySecurityHeaders(res: NextResponse, csp: string): NextResponse {
  for (const { key, value } of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

// Respostas de API são JSON, nunca um documento: a política correta é negar
// tudo (recomendação OWASP para REST) em vez de repetir o CSP de página.
const API_CSP = `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`;

// ─── i18n por URL real (BUG CRÍTICO CORRIGIDO, migração de SEO) ─
// Antes, idioma era 100% cookie/Accept-Language — a MESMA URL podia servir
// PT ou ES dependendo de quem pedia, o que é exatamente o que o Google
// desaconselha pra hreflang (e o Googlebot nunca reenvia cookie entre
// crawls, então ES nunca era indexado). Agora /es/... é uma URL real e
// distinta: reescrita internamente pra rota SEM PREFIXO (o Next.js serve
// o mesmo arquivo de rota, só que sabendo o locale via x-locale), e PT
// continua exatamente como sempre foi (sem prefixo) — nenhuma URL já
// indexada em PT muda. Só ADICIONA uma árvore de URL nova pra ES.
const LOCALE_PREFIX = '/es';

// UUID v4, mesma regex já usada em app/(public)/eventos/[id]/page.tsx e em
// outras páginas de detalhe do site, pré-combinada aqui com o prefixo
// /eventos/ — ver bloco de redirect eventos→leilões dentro de proxy().
const EVENTO_AUCTION_REGEX = /^\/eventos\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

// Países do Mercosul de língua espanhola — mesmo recorte já usado no resto
// do site ("Brasil, Argentina, Paraguai e Uruguai"). Brasil e qualquer país
// fora dessa lista (incluindo "sem sinal de geo", ex.: localhost em dev)
// caem no default 'pt'.
const PAISES_ES = new Set(['AR', 'PY', 'UY']);

// Só usado quando NÃO existe cookie tc_lang ainda (visitante genuinamente
// novo) — ver comentário em cima de `activeLocale` abaixo. x-vercel-ip-country
// só existe na Vercel (produção); em dev local vem undefined e cai no
// default 'pt' de qualquer forma, mesma limitação que app/(public)/page.tsx
// já tem pra geolocalização de cidade/estado.
function paisParaLocale(countryCode: string | null): 'pt' | 'es' {
  return countryCode && PAISES_ES.has(countryCode) ? 'es' : 'pt';
}

function stripLocalePrefix(pathname: string): { effectivePath: string; urlLocale: 'es' | null } {
  if (pathname === LOCALE_PREFIX) return { effectivePath: '/', urlLocale: 'es' };
  if (pathname.startsWith(`${LOCALE_PREFIX}/`)) {
    return { effectivePath: pathname.slice(LOCALE_PREFIX.length), urlLocale: 'es' };
  }
  return { effectivePath: pathname, urlLocale: null };
}

// Prefixa um path interno (ex.: destino de redirect) com /es quando o
// locale ativo da requisição é 'es' — pra um usuário que já está
// navegando em ES não ser jogado de volta pra uma URL em PT no meio do
// fluxo (ex.: /painel protegido redirecionando pro /login).
function withLocale(path: string, locale: 'pt' | 'es'): string {
  if (locale !== 'es') return path;
  return path === '/' ? LOCALE_PREFIX : `${LOCALE_PREFIX}${path}`;
}

// ─── Proxy (antigo middleware — renomeado no Next.js 16) ───────
export async function proxy(request: NextRequest) {
  const rawPathname = request.nextUrl.pathname;
  const { effectivePath: pathname, urlLocale } = stripLocalePrefix(rawPathname);

  // Ignorar arquivos estáticos e de build (sem overhead algum)
  //
  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): a regex original
  // (`.*\.(?:ext)$`, sem restrição de profundidade) casava com QUALQUER
  // caminho terminado numa extensão conhecida, inclusive dentro de uma rota
  // dinâmica de página real — /admin/leiloes/123.png é roteado pelo Next.js
  // para app/(admin)/admin/leiloes/[id]/page.tsx (não existe arquivo físico
  // correspondente), mas batia neste early-return e pulava 100% do proxy:
  // sem CSP, sem checagem de is_blocked, sem checagem de sessão de
  // recuperação de senha pendente. Todo arquivo estático real deste projeto
  // (ver public/) vive na raiz (ex.: /manifest.json, /sw.js) ou sob
  // /assets/ — nenhuma rota de página dinâmica usa esses prefixos. Restringir
  // o match a exatamente esses dois casos fecha a colisão sem afetar nenhum
  // asset real.
  const isTopLevelStaticFile = /^\/[^/]+\.(?:png|jpg|jpeg|webp|svg|ico|css|js|json|webmanifest|txt|woff2?|ttf|map)$/.test(pathname);
  const isAssetsStaticFile = pathname.startsWith('/assets/');
  if (pathname.startsWith('/_next') || isTopLevelStaticFile || isAssetsStaticFile) {
    return NextResponse.next();
  }

  // Rotas de API recebem headers de segurança mas não passam pela autenticação
  // SSR — cada handler valida a própria credencial (sessão ou API key). Não
  // existe (nem faz sentido existir) uma API prefixada com /es.
  if (pathname.startsWith('/api')) {
    // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): /api/admin/** não
    // tinha rate limiting algum — relevante só no cenário de uma sessão de
    // admin já comprometida (roubo de sessão, XSS), usada pra automatizar
    // abuso em volume (convites em massa, bloqueio em massa). Cada handler já
    // reexige is_admin(); isto é defesa em profundidade, não a autenticação
    // em si. Mesmo mecanismo e limite já usados para /login e /auth.
    if (pathname.startsWith('/api/admin')) {
      const ipAdmin = resolverIpConfiavel(request.headers);
      if (ipAdmin && !(await dentroDoLimite(`admin_${ipParaRateLimit(ipAdmin)}`))) {
        return applySecurityHeaders(
          new NextResponse('Too Many Requests', {
            status: 429,
            headers: { 'Retry-After': String(JANELA_SEGUNDOS) },
          }),
          API_CSP
        );
      }
    }
    return applySecurityHeaders(NextResponse.next(), API_CSP);
  }

  // ─── Redirect do antigo ?lang=pt|es em /anuncio e /vendedor ───
  // BUG CORRIGIDO (revisão pós-merge da migração de i18n/slug): antes da
  // migração pra URL por idioma existir, /anuncio/[id] e /vendedor/[id]
  // aceitavam ?lang=pt|es (com hreflang declarado pra essas duas variantes
  // de querystring — ver histórico do próprio código). Hoje esse parâmetro
  // não tem NENHUM efeito (o idioma vem 100% do prefixo /es, nunca de
  // querystring) — um link antigo com ?lang=es, possivelmente já indexado
  // ou compartilhado, silenciosamente jogava o visitante de volta pra
  // versão em português, sem redirect, sem aviso. Roda ANTES do redirect
  // de locale geral abaixo (que só olha cookie/geo) porque um ?lang=
  // explícito na própria URL é um sinal mais forte e deliberado do que
  // cookie/geo-guess, e precisa vencer os dois. `pathname` aqui já é o path
  // normalizado (sem prefixo /es — ver stripLocalePrefix no topo); se o
  // valor capturado por :slug for na verdade um UUID legado, a própria
  // rota de destino (/es/anuncio/[slug] ou /anuncio/[slug]) já tem seu
  // próprio fallback UUID→slug com redirect permanente — pior caso aqui é
  // 2 redirects em vez de 1, nunca um link quebrado ou o idioma errado.
  const legacyLang = request.nextUrl.searchParams.get('lang');
  const isLegacyLangRoute = pathname.startsWith('/anuncio/') || pathname.startsWith('/vendedor/');
  if (isLegacyLangRoute && (legacyLang === 'es' || legacyLang === 'pt')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocale(pathname, legacyLang);
    redirectUrl.searchParams.delete('lang');
    return NextResponse.redirect(redirectUrl, 308);
  }

  // ─── Troca explícita de idioma via seletor PT/ES (BUG CORRIGIDO) ─
  // pt não tem prefixo de URL próprio como /es tem pra es — uma URL sem
  // prefixo é ambígua entre "nova visita, siga o cookie/geo salvo" e "acabei
  // de clicar em PT no seletor, quero pt AGORA mesmo que o cookie ainda diga
  // es". Sem este sinal explícito, o redirect de cookie/geo mais abaixo
  // devolvia IMEDIATAMENTE pro /es antes do cookie ter qualquer chance de
  // virar 'pt' — o seletor parecia simplesmente não fazer nada. `setLocale`
  // só é gerado pelo próprio seletor (switchLocaleQuery, lib/locale.ts),
  // nunca por um link externo; resolvido e removido da URL aqui, antes de
  // qualquer outra decisão de locale, com o cookie atualizado no mesmo
  // redirect (senão a PRÓXIMA navegação, sem o parâmetro, ainda leria o
  // cookie antigo e voltaria a rebater pro /es).
  const explicitLocale = request.nextUrl.searchParams.get('setLocale');
  if (explicitLocale === 'pt' || explicitLocale === 'es') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocale(pathname, explicitLocale);
    redirectUrl.searchParams.delete('setLocale');
    const redirectResponse = NextResponse.redirect(redirectUrl, 307);
    redirectResponse.cookies.set('tc_lang', explicitLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false,
    });
    return redirectResponse;
  }

  // ─── Idioma efetivo desta requisição ──────────────────────────
  // Prioridade: prefixo /es explícito na URL > cookie tc_lang (preferência
  // já registrada, manual ou geo-guess de uma visita anterior) > geo pela
  // localização de acesso (país do IP, só quando não existe cookie ainda —
  // visitante genuinamente novo) > 'pt'.
  //
  // BUG CORRIGIDO (achado de revisão, 2026-08-30): a versão anterior desta
  // migração removeu de propósito a adivinhança por Accept-Language (motivo
  // documentado abaixo, ainda válido), mas isso também matou o
  // comportamento que a Home já tinha pra geolocalização de cidade/estado —
  // um visitante genuinamente novo vindo da Argentina/Paraguai/Uruguai
  // (sem cookie nenhum ainda) sempre caía em PT por padrão, mesmo o site já
  // usando x-vercel-ip-country pra outras features. IP-based (país) não é a
  // mesma coisa que Accept-Language: é um sinal estável por REQUISIÇÃO (não
  // muda entre um clique e outro, ao contrário do header de idioma do
  // navegador, que pode listar vários idiomas com pesos ambíguos), e vira
  // real 301/307 pra uma URL própria (nunca serve conteúdo diferente na
  // MESMA URL) — não reabre o bug original. Uma vez que QUALQUER locale
  // (geo-guess ou escolha manual no seletor) grava o cookie, ele passa a
  // mandar em todas as visitas seguintes — a escolha manual do usuário
  // sempre tem a palavra final.
  // BUG EVITADO: `cookieLang` só representa "cookie diz ES" (precisa ficar
  // assim — é usado abaixo só pra decidir o redirect de ES). Não dá pra
  // usar esse mesmo booleano pra decidir se o geo-guess deve rodar: um
  // cookie 'pt' explícito (escolha manual) faria `cookieLang` virar null
  // igualzinho a "nenhum cookie ainda", e o geo-guess sobrescreveria uma
  // escolha manual de PT pra alguém acessando de IP argentino/paraguaio/
  // uruguaio — exatamente o oposto do requisito ("se o usuário alterar
  // manualmente, seguir o idioma selecionado pelo usuário"). `hasStoredLang`
  // distingue de verdade "existe uma preferência salva" (pt OU es) de
  // "visitante novo, sem cookie nenhum" — só neste último caso o geo-guess
  // deve rodar.
  const rawCookieLang = request.cookies.get('tc_lang')?.value;
  const cookieLang = rawCookieLang === 'es' ? 'es' : null;
  const hasStoredLang = rawCookieLang === 'pt' || rawCookieLang === 'es';
  const geoLocale = hasStoredLang ? null : paisParaLocale(request.headers.get('x-vercel-ip-country'));
  const activeLocale: 'pt' | 'es' = urlLocale || cookieLang || geoLocale || 'pt';

  // BUG CORRIGIDO (migração de SEO): visitante com preferência ES definida
  // (cookie de uma visita anterior OU geo-guess desta mesma requisição)
  // pedindo uma URL SEM prefixo é redirecionado pra URL com prefixo, em vez
  // de simplesmente servir ES por baixo dos panos na URL de PT — isso
  // reabriria o mesmíssimo problema que motivou toda essa migração (a
  // MESMA URL servindo conteúdo diferente por visitante).
  //
  // BUG CRÍTICO CORRIGIDO (achado ao vivo pelo usuário em produção,
  // 2026-09-02): faltava excluir /auth aqui — só /painel e /admin tinham
  // guarda. O callback do login por Google (/auth/callback?code=...&next=)
  // vinha de fora (Supabase, sem prefixo /es nunca) e caía nesta regra geral
  // com cookie tc_lang=es, virando um 307 pra /es/auth/callback?code=...
  // ANTES da troca do código pela sessão acontecer. Login com Google
  // simplesmente falhava (ERR_FAILED) pra qualquer usuário com preferência
  // de idioma ES — rota técnica, nunca deveria ganhar prefixo de idioma
  // nenhum (não existe "página de callback em espanhol" pra servir).
  if (!urlLocale && activeLocale === 'es' && !pathname.startsWith('/painel') && !pathname.startsWith('/admin') && !pathname.startsWith('/auth')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocale(pathname, 'es');
    return NextResponse.redirect(redirectUrl, 307);
  }

  // BUG CRITICO CORRIGIDO (auditoria de SEO, verificacao ao vivo): eventos/[id]/page.tsx
  // tenta permanentRedirect() pra /leiloes/[slug] quando o id pertence a um leilao
  // (evitar conteudo quase-duplicado entre as duas rotas), mas essa rota herda o
  // Suspense de eventos/loading.tsx -- qualquer redirect() disparado dentro dela
  // vira so uma <meta>/template client-side (ver node_modules/next/dist/docs/01-app/
  // 03-api-reference/04-functions/redirect.md, secao 'streaming context'), nunca um
  // HTTP 308 de verdade. Confirmado ao vivo: a URL respondia 200 sem title/canonical/
  // JSON-LD, cacheada estaticamente. Resolver aqui, ANTES do Next.js entrar em modo
  // streaming, garante um redirect HTTP real. So dispara pra paths no formato exato
  // /eventos/{uuid-v4} (custo de 1 query soh nesse caso raro, zero overhead nas
  // demais requisicoes).
  const eventoAuctionMatch = pathname.match(EVENTO_AUCTION_REGEX);
  if (eventoAuctionMatch) {
    const anon = createSupabaseAnonClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: auctionForRedirect } = await anon
      .from('auction_events')
      .select('slug')
      .eq('id', eventoAuctionMatch[1])
      .neq('status', 'draft')
      .maybeSingle();
    if (auctionForRedirect?.slug) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = withLocale(`/leiloes/${auctionForRedirect.slug}`, activeLocale);
      return NextResponse.redirect(redirectUrl, 308);
    }
    // Sem match (id nao existe ou e draft): cai no fluxo normal -- a propria
    // eventos/[id]/page.tsx ainda tenta achar em auction_events/eventos e chama
    // notFound() corretamente se nao existir em nenhuma das duas.
  }

  // ─── Nonce para CSP ──────────────────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, pathname);

  const ip = resolverIpConfiavel(request.headers);

  // ─── Rate Limiting rotas críticas ────────────────────────────
  // BUG CORRIGIDO (validação adversarial final): sem nenhum header confiável
  // de IP (dev local, ou produção atrás de proxy mal configurado), aplicar
  // o limite por um balde compartilhado (ip=null) trancaria o login de todo
  // mundo por causa de um único cliente agressivo. Falha aberta aqui, mesma
  // filosofia já usada quando o Postgres do rate limit está indisponível.
  if (ip && (pathname.startsWith('/login') || pathname.startsWith('/auth'))) {
    // BUG CORRIGIDO (validação adversarial final): ipParaRateLimit trunca
    // IPv6 no prefixo /64 — um endereço IPv6 completo rotaciona fácil
    // demais (privacy extensions do próprio navegador, ou de propósito por
    // um atacante) pra servir de chave de rate limit contra força bruta.
    if (!(await dentroDoLimite(`login_${ipParaRateLimit(ip)}`))) {
      return applySecurityHeaders(
        new NextResponse('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': String(JANELA_SEGUNDOS) },
        }),
        csp
      );
    }
  }

  // ─── Montar response base ─────────────────────────────────────
  // Passamos o nonce para o layout via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // BUG CORRIGIDO (teste completo do site, 2026-08-24): app/(admin)/layout.tsx
  // redirecionava sempre para /login?redirectTo=/admin (string fixa) —
  // acessar /admin/leiloes sem sessão jogava o admin no dashboard genérico
  // depois de logar, não na página que ele realmente pediu. Layouts não
  // recebem o pathname atual como prop; repassamos aqui via header pra
  // qualquer Server Component poder ler com headers().get('x-pathname').
  // Sempre o path SEM prefixo de locale — é o que bate com a estrutura
  // real de rotas do app/(public)/.
  requestHeaders.set('x-pathname', pathname);
  // Locale efetivo desta requisição — ver lib/locale.ts (getLocale()), o
  // único lugar que qualquer Server Component deveria ler o idioma ativo
  // a partir de agora, em vez de cada página reimplementar sua própria
  // leitura de cookie/searchParams (foi exatamente essa duplicação que
  // causou o bug crítico original: duas cópias da mesma lógica divergindo
  // silenciosamente entre generateMetadata e o corpo da página).
  requestHeaders.set('x-locale', activeLocale);

  // Helper local: NextResponse.rewrite quando a URL pedida tem prefixo
  // /es (o Next.js precisa saber servir a rota SEM prefixo por baixo),
  // NextResponse.next nos demais casos — usado nos 3 pontos deste arquivo
  // que (re)constroem a response base.
  const nextForRoute = () =>
    urlLocale
      ? NextResponse.rewrite(new URL(pathname + request.nextUrl.search, request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  let response = nextForRoute();

  // ─── Supabase SSR Client ──────────────────────────────────────
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
      // BUG CORRIGIDO (auditoria de segurança, 2026-08-31): ver o mesmo
      // comentário em lib/supabase-server.ts — sem cookieOptions, o cookie de
      // sessão sai sem a flag `secure`.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Recriar response preservando headers de segurança, nonce e o
          // rewrite de locale (se houver) — mesmo helper usado na primeira
          // construção de `response`, pra nunca divergir entre os dois.
          response = nextForRoute();
          applySecurityHeaders(response, csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ─── Proteção de Rotas e Verificação de Bloqueio ───────────────────────────────
  let userId: string | null = null;
  let isBlocked: boolean | undefined;
  let claims: any;

  const hasAuthCookie = request.cookies
    .getAll()
    .some(c => c.name.includes('auth-token') || c.name.includes('sb-access-token') || c.name.startsWith('sb-'));

  if (hasAuthCookie) {
    // getClaims() valida o JWT localmente via WebCrypto quando o projeto usa
    // chaves assimétricas (este usa ES256), sem ida de rede. Com segredo
    // simétrico ele cai num round-trip equivalente ao getUser() — ou seja,
    // nunca é pior do que era antes.
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims;
    if (claims?.sub) {
      userId = claims.sub;
      if (typeof claims.is_blocked === 'boolean') isBlocked = claims.is_blocked;
    }
  }

  // BUG CORRIGIDO (validação adversarial final, achado crítico): uma sessão
  // criada a partir de um link de "esqueci minha senha" é uma sessão real e
  // válida como qualquer outra — o Supabase não a distingue de um login
  // normal no nível do cookie/JWT em si. Sem esta checagem, qualquer pessoa
  // que obtivesse o link de recuperação de outra conta (e-mail encaminhado,
  // computador compartilhado, histórico do navegador) e o abrisse ganhava
  // acesso total à conta (painel, mensagens, admin se aplicável) simplesmente
  // digitando /painel na barra de endereço, SEM NUNCA precisar trocar a
  // senha — e se só fechasse a aba sem completar o formulário, a sessão
  // continuava válida pra quem reabrisse o navegador depois.
  //
  // Tentativa inicial (descartada): checar o claim `amr` do JWT por
  // method='recovery'. Testado ao vivo com supabase.auth.verifyOtp
  // (type='recovery') real — o Supabase grava amr como [{"method":"otp"}],
  // não distinguindo recuperação de outros fluxos de OTP. Sem sinal
  // confiável no próprio JWT, a marcação vem de uma tabela dedicada
  // (public.pending_password_recovery, ver migration 20260828140000):
  // AuthContainer.tsx insere lá assim que o evento PASSWORD_RECOVERY do SDK
  // dispara (sinal client-side confiável, só ocorre com um link válido de
  // verdade); aqui checamos pelo session_id do JWT da requisição antes de
  // liberar /painel ou /admin.
  const isPainelOuAdmin = pathname.startsWith('/painel') || pathname.startsWith('/admin');
  if (isPainelOuAdmin && userId && claims?.session_id) {
    const { data: pendingRecovery } = await supabase
      .from('pending_password_recovery')
      .select('session_id')
      .eq('session_id', claims.session_id)
      .maybeSingle();

    if (pendingRecovery) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = withLocale('/login', activeLocale);
      redirectUrl.searchParams.set('error', 'recovery_session');
      const redirectResponse = applySecurityHeaders(NextResponse.redirect(redirectUrl), csp);

      request.cookies.getAll().forEach(cookie => {
        if (cookie.name.includes('auth-token') || cookie.name.includes('sb-access-token') || cookie.name.startsWith('sb-')) {
          redirectResponse.cookies.delete(cookie.name);
        }
      });

      return redirectResponse;
    }
  }

  // Fallback: enquanto o Custom Access Token Hook não estiver ativo no
  // dashboard, o claim não vem e voltamos ao SELECT de antes. Ver
  // supabase/migrations/20260822120100_custom_access_token_hook.sql
  if (userId && isBlocked === undefined) {
    const { data: secret } = await supabase
      .from('user_secrets')
      .select('is_blocked')
      .eq('id', userId)
      .single();
    isBlocked = !!secret?.is_blocked;
  }

  if (userId && isBlocked) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocale('/login', activeLocale);
    redirectUrl.searchParams.set('error', 'blocked');
    const redirectResponse = applySecurityHeaders(NextResponse.redirect(redirectUrl), csp);

    // Limpar os cookies de sessão no redirecionamento para efetivamente "deslogar"
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.includes('auth-token') || cookie.name.includes('sb-access-token') || cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });

    return redirectResponse;
  }

  const isPainelRoute = pathname.startsWith('/painel');
  if (isPainelRoute && !userId) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocale('/login', activeLocale);
    // BUG CORRIGIDO (achado na verificação pós-merge): `pathname` aqui já é
    // o path normalizado (sem prefixo /es — ver stripLocalePrefix no topo),
    // então redirectTo sempre carregava o destino em PT mesmo pra quem
    // estava navegando em /es/painel. Login funcionava normalmente, só o
    // pós-login devolvia pro /painel em português em vez de /es/painel.
    redirectUrl.searchParams.set('redirectTo', withLocale(pathname, activeLocale));
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), csp);
  }

  // ─── Cookie de idioma ─────────────────────────────────────────
  // BUG CORRIGIDO (migração de SEO): antes, o COOKIE (ou uma adivinhança por
  // Accept-Language) decidia o conteúdo — agora é o inverso: a URL
  // (/es/... ou sem prefixo) decide `activeLocale`, calculado lá em cima, e
  // o cookie só existe pra persistir a preferência do visitante entre
  // visitas (pro redirect automático mais acima) e pro estado inicial do
  // LangProvider client-side bater com o que o servidor já renderizou —
  // nunca mais como fonte de verdade do conteúdo em si.
  if (request.cookies.get('tc_lang')?.value !== activeLocale) {
    response.cookies.set('tc_lang', activeLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false, // precisa ser lido pelo JS para i18n
    });
  }

  applySecurityHeaders(response, csp);
  return response;
}

// ─── Matcher: executa apenas em rotas de página e API ──────────────────────────
// Exclui explicitamente assets estáticos do Next.js, imagens, fontes e favicon.
// Sem este config, o proxy rodaria em cada arquivo /_next/static, gerando
// overhead desnecessário e possíveis erros se SUPABASE_URL não estiver disponível.
//
// Atenção (Next.js 16): Server Actions são POSTs para a própria rota onde são
// usadas. Se um path for excluído daqui, as actions daquele path também deixam
// de passar pelo proxy — por isso cada route handler valida a sessão por conta.
export const config = {
  matcher: [
    /*
     * Inclui todas as rotas EXCETO:
     * - _next/static  (arquivos de build do Next.js)
     * - _next/image   (otimização de imagens)
     * - favicon.ico, sitemap.xml, robots.txt
     * - assets/*  (tudo sob /assets/, único prefixo de mídia estática deste projeto)
     * - arquivo estático de nível raiz com extensão comum (ex.: /manifest.json)
     *
     * BUG CORRIGIDO (auditoria de segurança, 2026-08-30): a exclusão de
     * extensão original (`.*\.(?:ext)`, sem limite de profundidade) casava
     * com QUALQUER path terminado numa extensão conhecida — inclusive dentro
     * de uma rota dinâmica real, como /admin/leiloes/123.png — e nesses
     * casos o proxy() nunca chega a ser INVOCADO (decisão é do matcher, não
     * de lógica interna), pulando CSP, rate limiting e as checagens de conta
     * bloqueada/sessão de recuperação pendente por completo. Restrito a
     * exatamente onde os arquivos reais deste projeto vivem (raiz ou
     * /assets/), que nenhuma rota de página dinâmica usa como prefixo.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|assets/.*|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|woff2?|ttf|otf|map)$).*)',
  ],
};
