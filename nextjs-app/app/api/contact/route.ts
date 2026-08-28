import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { resolverIpConfiavel } from '@/lib/ip-utils';

// Substitui o <form> fake que vinha embutido no HTML de institutional_pages
// (page=contato) — tinha um onsubmit puramente cosmético que fingia sucesso
// sem nunca enviar a mensagem a lugar nenhum. Esta rota persiste de verdade
// em contact_messages (migration 20260828120000), pro admin revisar em
// /admin/mensagens-contato.

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  'https://tauzeclass.com.br',
  'http://localhost:3000',
].filter(Boolean) as string[];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const lang = body?.lang === 'es' ? 'es' : 'pt';

  if (!isNonEmptyString(name, 200) || !EMAIL_REGEX.test(email) || !isNonEmptyString(subject, 200) || message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (phone.length > 40) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = createAdminClient();
  const ip = resolverIpConfiavel(request.headers);

  // Rate limit por IP (não há user_id — visitante pode estar deslogado).
  // Mesmo padrão de components/ads/AdMessageForm.tsx / AdReportModal.tsx.
  const { data: dentroDoLimite, error: rateLimitError } = await admin.rpc('check_rate_limit', {
    p_bucket: `contact_form_${ip}`,
    p_limit: 3,
    p_window_seconds: 600,
  });
  if (rateLimitError) {
    console.error('[contact] Erro ao checar rate limit:', rateLimitError.message);
  } else if (dentroDoLimite === false) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const { error } = await admin.from('contact_messages').insert({
    name,
    email,
    phone: phone || null,
    subject,
    message,
    lang,
  });

  if (error) {
    console.error('[contact] Erro ao salvar mensagem:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
