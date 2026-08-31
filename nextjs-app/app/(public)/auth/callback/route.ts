import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'

// BUG CORRIGIDO (varredura cruzada de cenários, achado de segurança): agora
// que loginWithGoogle() de fato usa esta rota (antes apontava direto pro
// destino final, veja lib/supabase.ts), o parâmetro `next` passa a ser
// atacável — um redirect server-side (NextResponse.redirect) pra uma origem
// externa é ainda mais perigoso que um client-side, já que nem precisa de JS
// no navegador da vítima. Só aceita caminhos relativos de verdade (começando
// com "/" único, nunca "//" nem "/\" que o navegador resolve como
// protocol-relative).
function getSafeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/painel'
  }
  return raw
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = getSafeNext(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON,
      {
        // BUG CORRIGIDO (auditoria de segurança, 2026-08-31): ver o mesmo
        // comentário em lib/supabase-server.ts — sem cookieOptions, o cookie
        // de sessão sai sem a flag `secure`.
        cookieOptions: { secure: process.env.NODE_ENV === 'production' },
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )
    
    // We can't exchange code easily if we aren't using SSR fully for all routes,
    // but @supabase/ssr handles this for us if we use createServerClient.
    // However, since we are largely using the client-side @supabase/supabase-js,
    // Supabase will automatically handle the PKCE callback in the hash fragment.
    // So this route might just redirect if it gets a query param, but PKCE flow
    // will be parsed by the client. 
    // Let's just exchange it to be safe if `code` is present.
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If there's no code (e.g. implicit flow with hash fragment), 
  // or it failed, just redirect to the home page or painel so the client SDK can pick it up.
  return NextResponse.redirect(`${origin}/painel`)
}
