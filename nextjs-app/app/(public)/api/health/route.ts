/**
 * GET /api/health
 * Endpoint leve pro keep-alive (.github/workflows/keep-alive.yml) manter o
 * Render Free Tier acordado — não toca banco nem faz nada custoso, só
 * confirma que o processo Node está de pé.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
