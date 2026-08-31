import { NextRequest, NextResponse } from 'next/server';
import { resolverIpConfiavel, ipParaRateLimit } from '@/lib/ip-utils';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';

// Coletor de erros do client. Usado por app/(public)/listagem/error.tsx.
//
// É um endpoint público e sem autenticação por natureza — um error boundary
// precisa conseguir reportar mesmo com a sessão quebrada. Por isso o corpo é
// tratado como entrada hostil: limite de tamanho, remoção de caracteres de
// controle e nenhum eco de volta para o cliente.
//
// Provisório. lib/monitoring.ts já está preparado para Sentry; assim que
// estiver ligado, este endpoint deve sair.

const MAX_BYTES = 4096;

// CR/LF e demais caracteres de controle permitiriam forjar linhas inteiras no
// agregador de logs (log injection).
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export async function POST(request: NextRequest) {
  // BUG CORRIGIDO (auditoria de segurança, 2026-08-31): único endpoint
  // público não autenticado do projeto sem NENHUM teto de volume — um
  // script podia martelar POST aqui indefinidamente, gerando ruído/custo no
  // agregador de log sem limite algum. Mesmo padrão fail-open de
  // app/api/contact/route.ts (sem IP confiável não dá pra distinguir
  // clientes — travaria o reporte de erro pra todo mundo); limite mais
  // folgado porque um error boundary real pode disparar mais de uma vez em
  // rajada.
  const ip = resolverIpConfiavel(request.headers);
  if (ip) {
    const permitido = await dentroDoLimiteFallback({
      bucket: `test_error_${ipParaRateLimit(ip)}`,
      limit: 20,
      windowSeconds: 60,
      logPrefix: 'test-error',
    });
    if (!permitido) {
      return NextResponse.json({ success: false, error: 'Too Many Requests' }, { status: 429 });
    }
  }

  const raw = await request.text();

  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'Payload muito grande' }, { status: 413 });
  }

  const safe = raw.replace(CONTROL_CHARS, ' ').slice(0, MAX_BYTES);

  console.error('[client-error]', safe);

  return NextResponse.json({ success: true });
}
