import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';
import { SECURITY_HEADERS } from '@/lib/security-headers';
import { resolverIpConfiavel } from '@/lib/ip-utils';
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

  try {
    const db = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('check_rate_limit', {
      p_bucket: chave,
      p_limit: LIMITE_TENTATIVAS,
      p_window_seconds: JANELA_SEGUNDOS,
    });
    if (error) {
      // Falha aberta: uma indisponibilidade do banco não pode trancar o login
      // de todo mundo. Mas não pode passar calado.
      console.error('[proxy] check_rate_limit falhou, liberando a requisição:', error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error('[proxy] check_rate_limit indisponível, liberando a requisição:', (e as Error).message);
    return true;
  }
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

// ─── Proxy (antigo middleware — renomeado no Next.js 16) ───────
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Ignorar arquivos estáticos e de build (sem overhead algum)
  if (
    pathname.startsWith('/_next') ||
    /\.(png|jpg|jpeg|webp|svg|ico|css|js|json|webmanifest|txt|woff2?|ttf|map)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Rotas de API recebem headers de segurança mas não passam pela autenticação
  // SSR — cada handler valida a própria credencial (sessão ou API key).
  if (pathname.startsWith('/api')) {
    return applySecurityHeaders(NextResponse.next(), API_CSP);
  }

  // ─── Nonce para CSP ──────────────────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, pathname);

  const ip = resolverIpConfiavel(request.headers);

  // ─── Rate Limiting rotas críticas ────────────────────────────
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    if (!(await dentroDoLimite(`login_${ip}`))) {
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
  requestHeaders.set('x-pathname', pathname);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ─── Supabase SSR Client ──────────────────────────────────────
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Recriar response preservando headers de segurança e nonce
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
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
      redirectUrl.pathname = '/login';
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
    redirectUrl.pathname = '/login';
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
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), csp);
  }

  // ─── Cookie de idioma ─────────────────────────────────────────
  let lang = request.cookies.get('tc_lang')?.value;
  if (!lang) {
    const acceptLang = request.headers.get('accept-language') || '';
    lang = acceptLang.toLowerCase().includes('es') ? 'es' : 'pt';
    response.cookies.set('tc_lang', lang, {
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
     * - Extensões de arquivo estático comuns
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|woff2?|ttf|otf|map)).*)',
  ],
};
