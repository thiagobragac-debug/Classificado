import { NextRequest, NextResponse } from 'next/server';
import { createClient, createClientForToken } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';
import { isForbiddenOrigin } from '@/lib/csrf-origin';

// ─── Rate Limiting ──────────────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
let ratelimit: Ratelimit | null = null;

if (redisUrl && redisToken) {
  ratelimit = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    // Limite por user_id autenticado (mais preciso que IP)
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: false,
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  // ─── Verificação de Origin (CSRF protection) ─────────────────
  // BUG CORRIGIDO (achado ao vivo em produção, 2026-09-25, mesma causa do
  // app/api/contact/route.ts): a allowlist própria desta rota (agora
  // removida) esquecia 'https://www.tauzeclass.com.br' — só tinha o domínio
  // sem www. Na prática o risco era baixo aqui (rota é aberta via <a
  // target="_blank">, navegação de topo normalmente não manda header Origin
  // — diferente do POST via fetch() de app/api/contact), mas ainda assim
  // divergia da allowlist certa. Trocado pelo utilitário compartilhado
  // lib/csrf-origin.ts.
  if (isForbiddenOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const adId = searchParams.get('adId');

  // ─── Autenticação ───────────────────────────────────────────────
  // O número de WhatsApp é dado pessoal — só usuários autenticados podem
  // acessar. Dois caminhos:
  // (a) Bearer token (`Authorization: Bearer <jwt>`) — apps nativos, que não
  //     têm cookie de sessão de browser. Resposta é JSON, não redirect,
  //     porque um cliente HTTP nativo trata redirect de forma diferente de
  //     um <a target="_blank"> de browser.
  // (b) Cookie de sessão — comportamento original do site, inalterado.
  // GAP CORRIGIDO (reteste do site, 2026-08-25): esta rota é aberta direto
  // pelo navegador (<a target="_blank">), não chamada via fetch/XHR — um
  // visitante deslogado clicando "Falar com Vendedor" no mobile abria uma
  // aba nova mostrando o JSON crú {"error":"Unauthorized",...} em vez de
  // uma tela reconhecível. Agora redireciona pro login com `next` de volta
  // pro anúncio, igual ao padrão já usado no resto do site.
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isNativeBearer = bearerToken !== null;

  let supabase;
  let user;
  if (isNativeBearer) {
    // Validar o JWT com o client admin (mesmo padrão de app/api/checkout/route.ts)
    // antes de usá-lo — nunca confiar cegamente num token vindo do header.
    const { data, error } = await createAdminClient().auth.getUser(bearerToken);
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    user = data.user;
    // Client escopado no JWT do próprio usuário (não o service role) — é o
    // que faz auth.uid() resolver corretamente dentro de get_seller_phone
    // (SECURITY DEFINER que lê auth.uid() internamente).
    supabase = createClientForToken(bearerToken);
  } else {
    supabase = await createClient();
    const { data: { user: cookieUser } } = await supabase.auth.getUser();
    if (!cookieUser) {
      const loginUrl = new URL('/login', request.url);
      if (adId && UUID_REGEX.test(adId)) {
        loginUrl.searchParams.set('next', `/anuncio/${adId}`);
      }
      return NextResponse.redirect(loginUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'no-store, no-cache, private',
          'Pragma': 'no-cache',
        },
      });
    }
    user = cookieUser;
  }

  // ─── E-mail verificado obrigatório (auditoria de segurança) ────
  // GAP CORRIGIDO: até aqui, qualquer conta recém-criada (mesmo sem nunca
  // confirmar o e-mail) já conseguia pedir o WhatsApp de vendedores — a
  // única barreira era o rate limit de 10/min por conta. Como o cadastro é
  // self-service e não tem CAPTCHA, isso permitia colher contato de vários
  // vendedores criando contas descartáveis em série (cada uma dentro do
  // próprio limite). Exigir e-mail confirmado encarece esse abuso sem
  // afetar usuários reais: contas via Google OAuth já chegam com
  // email_confirmed_at preenchido pelo provedor; é o mesmo campo já usado
  // em app/(public)/painel/_components/ProfileTab.tsx pro badge
  // Verificado/Pendente, não uma checagem nova inventada aqui.
  if (!user.email_confirmed_at) {
    if (isNativeBearer) {
      return NextResponse.json({ error: 'Email not confirmed' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/painel', request.url), {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, no-cache, private',
        'Pragma': 'no-cache',
      },
    });
  }

  // ─── Rate limiting por user_id (não por IP — mais preciso) ───
  if (ratelimit) {
    const { success, limit, remaining } = await ratelimit.limit(`contact_user_${user.id}`);
    if (!success) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Você enviou muitas solicitações. Aguarde um momento.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
          },
        }
      );
    }
  } else {
    // BUG CORRIGIDO (varredura de segurança): sem Upstash configurado, esta
    // rota ficava sem NENHUM limite (diferente de app/api/contact/route.ts
    // e do próprio proxy.ts, que sempre têm um fallback via Postgres) —
    // um único usuário autenticado podia colher telefone de vendedor sem
    // teto algum. Mesma RPC check_rate_limit já usada em proxy.ts.
    const permitido = await dentroDoLimiteFallback({
      bucket: `contact_user_${user.id}`,
      limit: 10,
      logPrefix: 'contact-seller',
    });
    if (!permitido) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Você enviou muitas solicitações. Aguarde um momento.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  }

  // ─── Validação do adId ────────────────────────────────────────
  if (!adId) {
    return NextResponse.json({ error: 'Missing adId parameter' }, { status: 400 });
  }

  if (!UUID_REGEX.test(adId)) {
    return NextResponse.json({ error: 'Invalid adId format' }, { status: 400 });
  }

  // ─── Busca do anúncio ──────────────────────────────────────────
  // BUG CORRIGIDO (fechamento pré-produção): phone_whatsapp mudou de
  // profiles pra user_secrets (migration 20260829130000) — RLS de
  // user_secrets é self-only, então nem o cliente da sessão (comprador)
  // consegue mais ler o telefone do VENDEDOR via embed direto (isso é
  // intencional: é o mesmo modelo de RLS que protege email/documento/etc.).
  // A leitura cruzada legítima (comprador -> telefone do vendedor de um
  // anúncio ativo) agora passa pela RPC get_seller_phone, que faz sua
  // própria checagem de autorização (SECURITY DEFINER).
  try {
    const { data: ad, error } = await supabase
      .from('ads')
      .select('title_pt, title_es, status')
      .eq('id', adId)
      .eq('status', 'active') // apenas anúncios ativos
      .single();

    if (error || !ad) {
      return NextResponse.json({ error: 'Ad not found or inactive' }, { status: 404 });
    }

    const { data: phone, error: phoneError } = await supabase.rpc('get_seller_phone', { p_ad_id: adId });
    if (phoneError) {
      console.error('[contact-seller] get_seller_phone falhou:', phoneError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    if (!phone) {
      return NextResponse.json({ error: 'Seller contact not available' }, { status: 404 });
    }

    const title = ad.title_pt || ad.title_es || 'Anúncio';
    // Garantir que o número tenha apenas dígitos e código de país
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return NextResponse.json({ error: 'Invalid seller phone number' }, { status: 404 });
    }
    const message = encodeURIComponent(`Olá! Tenho interesse no anúncio: ${title}`);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;

    // Cache-Control: private + no-store para evitar que CDNs cacheiem a resposta/redirecionamento pessoal
    const cacheHeaders = { 'Cache-Control': 'no-store, no-cache, private', 'Pragma': 'no-cache' };

    // Apps nativos: JSON, o cliente HTTP nativo decide como abrir a URL
    // (Intent.ACTION_VIEW / UIApplication.open) — um redirect 302 misturaria
    // "sucesso" com "siga esta URL", que nem todo cliente HTTP nativo segue
    // automaticamente do jeito que um browser segue.
    if (isNativeBearer) {
      return NextResponse.json({ whatsappUrl }, { headers: cacheHeaders });
    }

    return NextResponse.redirect(whatsappUrl, { status: 302, headers: cacheHeaders });
  } catch (err) {
    console.error('[contact-seller] Erro interno:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
