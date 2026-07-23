import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';

// In-memory rate limiting (Note: In a true Edge environment like Vercel, this resets frequently. For production, use Upstash Redis)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

export async function middleware(request: NextRequest) {
  // Ignorar arquivos estáticos e de build
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Rate Limiting para rotas críticas (ex: login e certas actions)
  if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/auth')) {
    const ip = request.headers.get('x-forwarded-for') || request.ip || '127.0.0.1';
    const now = Date.now();
    const rateLimitInfo = rateLimitMap.get(ip);

    if (rateLimitInfo && now - rateLimitInfo.timestamp < RATE_LIMIT_WINDOW_MS) {
      if (rateLimitInfo.count >= MAX_REQUESTS_PER_WINDOW) {
        return new NextResponse('Too Many Requests', { status: 429 });
      }
      rateLimitInfo.count += 1;
    } else {
      rateLimitMap.set(ip, { count: 1, timestamp: now });
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
  
  // 1. Atualizar a sessão do Supabase silenciosamente
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Atualiza request & response de acordo com a doc do Supabase SSR
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // A chamada a getUser() força o token a atualizar, se estiver expirado
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Proteger rotas privadas
  const isPainelRoute = request.nextUrl.pathname.startsWith('/painel');
  
  if (isPainelRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Verifica se o cookie tc_lang já existe
  let lang = request.cookies.get('tc_lang')?.value;

  if (!lang) {
    // Detecta o idioma preferido do navegador
    const acceptLang = request.headers.get('accept-language') || '';
    if (acceptLang.includes('es')) {
      lang = 'es';
    } else {
      lang = 'pt'; // Default
    }
    
    // Seta o cookie para expirar em 1 ano
    response.cookies.set('tc_lang', lang, { 
      path: '/', 
      maxAge: 60 * 60 * 24 * 365 
    });
  }

  return response;
}

