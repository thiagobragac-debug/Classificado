import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  
  // Efetua o signout no servidor, que limpará os cookies de sessão
  await supabase.auth.signOut();
  
  const url = new URL(request.url);
  // Redireciona o usuário para a home page
  return NextResponse.redirect(`${url.origin}/`);
}
