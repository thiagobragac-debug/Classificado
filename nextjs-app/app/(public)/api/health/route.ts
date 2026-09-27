/**
 * GET /api/health
 * Endpoint leve pro keep-alive (.github/workflows/keep-alive.yml) manter o
 * Render Free Tier acordado — não toca banco nem faz nada custoso, só
 * confirma que o processo Node está de pé.
 *
 * Campo `memory` adicionado (achado ao vivo, 26-27/set/2026: 3 crashes de
 * OOM em ~36h) pro monitor externo (scripts/monitor-render-supabase.mjs)
 * conseguir amostrar o uso de memória REAL do processo em produção — o
 * Render bloqueia o gráfico oficial de memória/CPU atrás de um plano pago
 * (confirmado ao vivo no dashboard), então esta é a forma gratuita de ter
 * histórico real. process.memoryUsage() é síncrono e não custoso — não
 * muda o caráter "leve" deste endpoint.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const mem = process.memoryUsage();
  return NextResponse.json(
    {
      status: 'ok',
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
