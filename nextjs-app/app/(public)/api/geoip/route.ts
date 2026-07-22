/**
 * GET /api/geoip
 * Detecção de localização server-side — 3 provedores em cascata.
 * Sem CORS, sem permissão de browser. Funciona em prod e dev.
 *
 * Provedores:
 * 1. ip-api.com  — ~100ms, gratuito, sem autenticação (HTTP no free tier)
 * 2. ipwho.is    — ~200ms, gratuito, HTTPS, retorna regionCode
 * 3. ipapi.co    — fallback final (~500-1000ms quando disponível)
 */
import { NextResponse, type NextRequest } from 'next/server';

const COUNTRY_MAP: Record<string, string> = {
  BR: 'Brasil', UY: 'Uruguai', AR: 'Argentina',
  PY: 'Paraguai', CL: 'Chile', CO: 'Colômbia',
  PE: 'Peru',    BO: 'Bolívia', VE: 'Venezuela',
  EC: 'Equador', US: 'Estados Unidos', PT: 'Portugal',
  MX: 'México',  DO: 'República Dominicana', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicarágua', CR: 'Costa Rica',
  PA: 'Panamá',  CU: 'Cuba', PR: 'Porto Rico',
};

function normalizeCountry(code: string): string {
  return COUNTRY_MAP[code?.toUpperCase()] ?? code;
}

function isLocalIp(ip: string) {
  return !ip || ip === '127.0.0.1' || ip === '::1'
    || ip.startsWith('192.168.') || ip.startsWith('10.')
    || ip.startsWith('172.16.') || ip.startsWith('172.17.')
    || ip.startsWith('172.18.') || ip.startsWith('172.19.')
    || ip.startsWith('172.2') || ip.startsWith('172.3');
}

type GeoResult = {
  city:      string | null;
  state:     string | null;   // nome completo: "Minas Gerais"
  stateCode: string | null;   // sigla: "MG"
  country:   string | null;   // nome PT: "Brasil"
};

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp    = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0].trim() ?? realIp ?? '127.0.0.1';
  const local = isLocalIp(ip);

  const HEADERS = { 'Cache-Control': 'private, max-age=3600' };

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEDOR 1 — ip-api.com (~100ms, HTTP ok no servidor)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const ipParam = local ? '' : `/${ip}`;
    const url = `http://ip-api.com/json${ipParam}?fields=status,city,regionName,regionCode,countryCode&lang=pt`;

    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });

    if (res.ok) {
      const d = await res.json();
      if (d?.status === 'success' && d.countryCode) {
        const result: GeoResult = {
          city:      d.city       ?? null,
          state:     d.regionName ?? null,
          stateCode: d.regionCode ?? null,
          country:   normalizeCountry(d.countryCode),
        };
        console.log('[geoip] ip-api.com:', result);
        return NextResponse.json(result, { headers: HEADERS });
      }
    }
  } catch (e) {
    console.warn('[geoip] ip-api.com falhou:', e);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEDOR 2 — ipwho.is (~200ms, HTTPS, retorna regionCode)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const url = local ? 'https://ipwho.is/' : `https://ipwho.is/${ip}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });

    if (res.ok) {
      const d = await res.json();
      if (d?.success && d.country_code) {
        const result: GeoResult = {
          city:      d.city        ?? null,
          state:     d.region      ?? null,
          stateCode: d.region_code ?? null,
          country:   normalizeCountry(d.country_code),
        };
        console.log('[geoip] ipwho.is:', result);
        return NextResponse.json(result, { headers: HEADERS });
      }
    }
  } catch (e) {
    console.warn('[geoip] ipwho.is falhou:', e);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEDOR 3 — ipapi.co (fallback final)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const url = local
      ? 'https://ipapi.co/json/'
      : `https://ipapi.co/${ip}/json/`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TauzeClass/1.0' },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const d = await res.json();
      if (d && !d.error && d.country_code) {
        const result: GeoResult = {
          city:      d.city        ?? null,
          state:     d.region      ?? null,
          stateCode: d.region_code ?? null,
          country:   normalizeCountry(d.country_code),
        };
        console.log('[geoip] ipapi.co:', result);
        return NextResponse.json(result, { headers: HEADERS });
      }
    }
  } catch (e) {
    console.warn('[geoip] ipapi.co falhou:', e);
  }

  console.warn('[geoip] todos os provedores falharam para IP:', ip);
  return NextResponse.json(null, { headers: HEADERS });
}
