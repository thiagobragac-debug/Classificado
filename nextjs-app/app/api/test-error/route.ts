import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
  const raw = await request.text();

  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'Payload muito grande' }, { status: 413 });
  }

  const safe = raw.replace(CONTROL_CHARS, ' ').slice(0, MAX_BYTES);

  console.error('[client-error]', safe);

  return NextResponse.json({ success: true });
}
