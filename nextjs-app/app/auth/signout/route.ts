import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { resolveTrustedOrigin } from '@/lib/csrf-origin';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Efetua o signout no servidor, que limpará os cookies de sessão
  await supabase.auth.signOut();

  // BUG CORRIGIDO (achado ao vivo, 2026-09-24): `new URL(request.url).origin`
  // resolvia pra http://0.0.0.0:10000 (host:porta interno da Render) em vez
  // do domínio público. Ver resolveTrustedOrigin em lib/csrf-origin.ts.
  const origin = resolveTrustedOrigin(request);
  // Redireciona o usuário para a home page
  return NextResponse.redirect(`${origin}/`);
}
