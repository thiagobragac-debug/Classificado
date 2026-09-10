import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';

// Rota server-side pro primeiro contato de um comprador com o dono do
// anúncio (mesmo fluxo que components/ads/AdMessageForm.tsx cobria com um
// insert direto do navegador). Existe pra restaurar o limite de taxa
// apertado (10 msgs/60s) que o formulário sempre teve a INTENÇÃO de aplicar
// via `sb.rpc('check_rate_limit', ...)`, mas que nunca funcionou de fato em
// produção — a migration 20260830200000 revogou o EXECUTE dessa RPC de
// anon/authenticated (fechando outra brecha: chamada forjada via PostgREST
// com bucket de outro usuário), então a chamada direto do client sempre
// retornava 42501 e, como o error não era checado, o guard nunca bloqueava
// nada (ver components/ads/AdMessageForm.tsx). O trigger enforce_message_rate_limit
// no banco (20 msgs/hora por remetente) continua existindo e agindo como
// rede de segurança por trás desta rota — não foi removido nem substituído,
// é uma segunda camada independente que protege a tabela mesmo se este
// endpoint tiver um bug ou for contornado por algum caminho futuro.
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  'https://tauzeclass.com.br',
  'http://localhost:3000',
].filter(Boolean) as string[];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = 1000; // mesmo teto de components/ads/AdMessageForm.tsx

export async function POST(request: NextRequest) {
  // ─── Verificação de Origin (CSRF protection) ─────────────────
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

  const adId = typeof body?.adId === 'string' ? body.adId : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (!UUID_REGEX.test(adId)) {
    return NextResponse.json({ error: 'Invalid adId' }, { status: 400 });
  }
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  // ─── Autenticação obrigatória (client autenticado via cookie de sessão,
  // sincronizado pelo createBrowserClient do lib/supabase.ts) ────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Rate limit por user_id (10 msgs/60s) — a proteção que o client
  // tentava fazer e nunca conseguiu. Fail-open em indisponibilidade do
  // banco, mesma filosofia de todo resto do fallback (ver
  // lib/rate-limit-fallback.ts): uma falha de infra não pode travar o
  // contato entre comprador e vendedor pra todo mundo.
  const permitido = await dentroDoLimiteFallback({
    bucket: `message_user_${user.id}`,
    limit: 10,
    windowSeconds: 60,
    logPrefix: 'messages-send',
  });
  if (!permitido) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Muitas mensagens em pouco tempo. Aguarde um momento.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // ─── Anúncio precisa existir, estar ativo, e não ser do próprio remetente.
  // O receiver_id NUNCA vem do client (evita depender de um valor que o
  // navegador poderia mandar errado/adulterado) — é sempre derivado aqui do
  // dono real do anúncio, igual a policy msgs_insert_dono_ou_resposta já
  // exige via is_ad_owner() no banco.
  const { data: ad, error: adError } = await supabase
    .from('ads')
    .select('user_id')
    .eq('id', adId)
    .eq('status', 'active')
    .single();

  if (adError || !ad) {
    return NextResponse.json({ error: 'Ad not found or inactive' }, { status: 404 });
  }
  if (ad.user_id === user.id) {
    return NextResponse.json({ error: 'Cannot message your own ad' }, { status: 400 });
  }

  // Insert via client vinculado à sessão (não o admin) — mantém a RLS de
  // messages como segunda validação independente desta rota.
  const { data, error } = await supabase
    .from('messages')
    .insert({
      ad_id: adId,
      sender_id: user.id,
      receiver_id: ad.user_id,
      content,
    })
    .select()
    .single();

  if (error) {
    // error.code é sempre P0001 (RAISE EXCEPTION genérico do Postgres) — não
    // distingue este trigger de outros. Mesmo padrão de MyAdsTab.tsx
    // (handleToggle/enforce_ad_quota): casa por trecho estável da mensagem.
    // Só alcançável aqui se o limite de 60s acima já tiver resetado mas o de
    // 20/hora (janela maior) ainda não — os dois limites são independentes.
    if (error.message?.includes('Rate limit exceeded')) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Muitas mensagens em pouco tempo. Aguarde um momento.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('[messages-send] Erro ao inserir mensagem:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
