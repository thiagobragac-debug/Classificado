import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/painel'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON,
      {
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
