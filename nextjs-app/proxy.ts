import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';
import { SECURITY_HEADERS } from '@/lib/security-headers';
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
const MP_CONNECT = ['https://api.mercadopago.com', 'https://api.mercadolibre.com', 'https://events.mercadopago.com'];

// ─── CSP Builder ───────────────────────────────────────────────
function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const supabaseHttp = SUPABASE_HOST ? [`https://${SUPABASE_HOST}`] : [];
  const supabaseWs = SUPABASE_HOST ? [`wss://${SUPABASE_HOST}`] : [];

  const directive = (name: string, values: string[]) => `${name} ${values.join(' ')}`;

  return [
    `default-src 'self'`,
    // nonce obrigatório para scripts inline do Next.js (hydration)
    directive('script-src', [
      `'self'`,
      `'nonce-${nonce}'`,
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
  const csp = buildCsp(nonce);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

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

  const hasAuthCookie = request.cookies
    .getAll()
    .some(c => c.name.includes('auth-token') || c.name.includes('sb-access-token') || c.name.startsWith('sb-'));

  if (hasAuthCookie) {
    // getClaims() valida o JWT localmente via WebCrypto quando o projeto usa
    // chaves assimétricas (este usa ES256), sem ida de rede. Com segredo
    // simétrico ele cai num round-trip equivalente ao getUser() — ou seja,
    // nunca é pior do que era antes.
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub) {
      userId = claims.sub;
      if (typeof claims.is_blocked === 'boolean') isBlocked = claims.is_blocked;
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
