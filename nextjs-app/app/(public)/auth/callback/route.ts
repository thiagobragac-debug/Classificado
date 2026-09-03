import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'

// Restaurada (2026-09-02) como FALLBACK do login com Google — ver
// lib/google-identity.ts. O fluxo principal agora é signInWithIdToken
// (sem redirect nenhum), mas o seletor de conta (FedCM) depende do
// usuário estar "logado no próprio Chrome" — testado ao vivo e confirmado
// que isso falha em aba anônima ("Provider's accounts list is empty",
// Chrome desliga FedCM de propósito em modo anônimo) e em qualquer
// Chrome sem login feito no navegador ("Not signed in with the identity
// provider"), mesmo com uma sessão real do Gmail aberta numa aba — os
// dois são cenários reais, não hipotéticos. app/(public)/login/components/
// LoginForm.tsx cai de volta pro fluxo antigo (loginWithGoogle,
// signInWithOAuth) automaticamente nesses casos, que termina aqui.
//
// BUG CORRIGIDO (varredura cruzada de cenários, achado de segurança): o
// parâmetro `next` é atacável — um redirect server-side (NextResponse.redirect)
// pra uma origem externa é ainda mais perigoso que um client-side, já que nem
// precisa de JS no navegador da vítima. Só aceita caminhos relativos de
// verdade (começando com "/" único, nunca "//" nem "/\" que o navegador
// resolve como protocol-relative).
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Sem código (ou troca falhou): volta pro painel pra o client SDK
  // resolver a sessão sozinho, se houver alguma.
  return NextResponse.redirect(`${origin}/painel`)
}
