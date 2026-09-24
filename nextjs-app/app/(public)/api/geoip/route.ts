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
  // DEBUG TEMPORÁRIO (achado ao vivo, 2026-09-24): geoip resolvendo sempre
  // pro egress do servidor (Washington DC) em vez do IP real do visitante
  // desde a migração pro Render — precisa ver os headers crus que chegam de
  // verdade atrás do Cloudflare do Render (topologia diferente da Vercel,
  // que era o que lib/ip-utils.ts::resolverIpConfiavel() foi escrito pra
  // ler). Remover assim que o fix certo for aplicado.
  if (request.nextUrl.searchParams.get('debug') === '1') {
    return NextResponse.json({
      result,
      headers: {
        'x-vercel-forwarded-for': request.headers.get('x-vercel-forwarded-for'),
        'x-real-ip': request.headers.get('x-real-ip'),
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
        'true-client-ip': request.headers.get('true-client-ip'),
        'x-forwarded-host': request.headers.get('x-forwarded-host'),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
