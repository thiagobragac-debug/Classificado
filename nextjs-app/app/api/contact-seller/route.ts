import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAnonClient } from '@/lib/supabase-server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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

export async function GET(request: NextRequest) {
  // ─── Verificação de Origin (CSRF protection) ─────────────────
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ─── Autenticação obrigatória ─────────────────────────────────
  // O número de WhatsApp é dado pessoal — só usuários autenticados podem acessar
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Faça login para contatar o vendedor.' },
      { status: 401 }
    );
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
  }

  // ─── Validação do adId ────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const adId = searchParams.get('adId');

  if (!adId) {
    return NextResponse.json({ error: 'Missing adId parameter' }, { status: 400 });
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(adId)) {
    return NextResponse.json({ error: 'Invalid adId format' }, { status: 400 });
  }

  // ─── Busca do anúncio (cliente anônimo — dados públicos) ──────
  try {
    const anonSb = createAnonClient();
    const { data: ad, error } = await anonSb
      .from('ads')
      .select('title_pt, title_es, status, profiles(phone_whatsapp)')
      .eq('id', adId)
      .eq('status', 'active') // apenas anúncios ativos
      .single();

    if (error || !ad) {
      return NextResponse.json({ error: 'Ad not found or inactive' }, { status: 404 });
    }

    const profile = Array.isArray(ad.profiles) ? ad.profiles[0] : ad.profiles;
    const phone = (profile as any)?.phone_whatsapp;
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
