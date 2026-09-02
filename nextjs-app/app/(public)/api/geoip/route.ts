/**
 * GET /api/geoip
 * Detecção de localização server-side — 3 provedores em cascata.
 * Sem CORS, sem permissão de browser. Funciona em prod e dev.
 *
 * A lógica de geolocalização em si (cascata de provedores, mapa de países)
 * vive em lib/geoip.ts — extraída pra ser reusada também em
 * app/api/checkout/route.ts e app/api/checkout/init/route.ts como fonte
 * autoritativa de país no momento de cobrar (ver comentário em lib/geoip.ts).
 * Esta rota continua existindo tal como antes: é o que a página pública
 * /planos usa pra decidir R$ vs US$ antes do login.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveGeo } from '@/lib/geoip';

export async function GET(request: NextRequest) {
  // BUG CORRIGIDO (propagação de idioma na geolocalização): país agora respeita tc_lang.
  const lang = request.nextUrl.searchParams.get('lang') === 'es' ? 'es' : 'pt';
  const result = await resolveGeo(request.headers, lang);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
