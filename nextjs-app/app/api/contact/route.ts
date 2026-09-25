import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { resolverIpConfiavel, ipParaRateLimit } from '@/lib/ip-utils';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';
import { isForbiddenOrigin } from '@/lib/csrf-origin';

// Substitui o <form> fake que vinha embutido no HTML de institutional_pages
// (page=contato) — tinha um onsubmit puramente cosmético que fingia sucesso
// sem nunca enviar a mensagem a lugar nenhum. Esta rota persiste de verdade
// em contact_messages (migration 20260828120000), pro admin revisar em
// /admin/mensagens-contato.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

export async function POST(request: NextRequest) {
  // BUG CORRIGIDO (achado ao vivo em produção, 2026-09-25): a allowlist
  // própria desta rota (agora removida) esquecia 'https://www.tauzeclass.com.br'
  // — só tinha o domínio sem www. Como o site real roda em www.tauzeclass.com.br
  // (confirmado ao vivo: todo curl/navegação desta sessão), TODA submissão
  // real do formulário Fale Conosco vinha sendo rejeitada com 403, mostrando
  // só "Erro ao enviar. Tente novamente em instantes." sem indicar a causa
  // real (não era transitório, tentar de novo nunca funcionava). Trocado
  // pelo utilitário compartilhado lib/csrf-origin.ts, que já tem a allowlist
  // certa (com e sem www) e foi criado exatamente pra evitar essa classe de
  // divergência silenciosa entre rotas.
  if (isForbiddenOrigin(request)) {
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
  //
  // BUG CORRIGIDO (validação adversarial final): sem header confiável de IP,
  // `contact_form_${null}` colapsava todo cliente nessa situação num único
  // balde — um visitante sem esses headers travava o formulário pra todos os
  // outros na mesma situação. Sem IP pra distinguir, não dá pra limitar por
  // IP; falha aberta (mesma filosofia do rate limit de login em proxy.ts).
  if (ip) {
    // BUG CORRIGIDO (validação adversarial final): rate limit por endereço
    // IPv6 completo é ineficaz — um /64 inteiro é alocado por cliente em
    // provedores residenciais/móveis, e o sufixo rotaciona fácil (privacy
    // extensions do navegador, ou de propósito por um script), permitindo
    // gerar baldes praticamente infinitos a partir da mesma conexão.
    // ipParaRateLimit trunca no prefixo /64 (ver lib/ip-utils.ts).
    const permitido = await dentroDoLimiteFallback({
      bucket: `contact_form_${ipParaRateLimit(ip)}`,
      limit: 3,
      windowSeconds: 600,
      logPrefix: 'contact',
    });
    if (!permitido) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
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
