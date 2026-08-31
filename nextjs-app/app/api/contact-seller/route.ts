import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';

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

// ─── Validação de Origin ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  'https://tauzeclass.com.br',
  'http://localhost:3000',
].filter(Boolean) as string[];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  // ─── Verificação de Origin (CSRF protection) ─────────────────
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const adId = searchParams.get('adId');

  // ─── Autenticação obrigatória ─────────────────────────────────
  // O número de WhatsApp é dado pessoal — só usuários autenticados podem acessar.
  // GAP CORRIGIDO (reteste do site, 2026-08-25): esta rota é aberta direto
  // pelo navegador (<a target="_blank">), não chamada via fetch/XHR — um
  // visitante deslogado clicando "Falar com Vendedor" no mobile abria uma
  // aba nova mostrando o JSON crú {"error":"Unauthorized",...} em vez de
  // uma tela reconhecível. Agora redireciona pro login com `next` de volta
  // pro anúncio, igual ao padrão já usado no resto do site.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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

    // Cache-Control: private + no-store para evitar que CDNs cacheiem redirecionamentos pessoais
    return NextResponse.redirect(whatsappUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, no-cache, private',
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[contact-seller] Erro interno:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
