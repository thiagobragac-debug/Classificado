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
import { resolverIpConfiavel, isValidIp, isLocalIp } from '@/lib/ip-utils';

const COUNTRY_MAP: Record<string, string> = {
  BR: 'Brasil', UY: 'Uruguai', AR: 'Argentina',
  PY: 'Paraguai', CL: 'Chile', CO: 'Colômbia',
  PE: 'Peru',    BO: 'Bolívia', VE: 'Venezuela',
  EC: 'Equador', US: 'Estados Unidos', PT: 'Portugal',
  MX: 'México',  DO: 'República Dominicana', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicarágua', CR: 'Costa Rica',
  PA: 'Panamá',  CU: 'Cuba', PR: 'Porto Rico',
};

// BUG CORRIGIDO (propagação de idioma na geolocalização): mapa de países em espanhol.
const COUNTRY_MAP_ES: Record<string, string> = {
  BR: 'Brasil', UY: 'Uruguay', AR: 'Argentina',
  PY: 'Paraguay', CL: 'Chile', CO: 'Colombia',
  PE: 'Peru',    BO: 'Bolivia', VE: 'Venezuela',
  EC: 'Ecuador', US: 'Estados Unidos', PT: 'Portugal',
  MX: 'Mexico',  DO: 'República Dominicana', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua', CR: 'Costa Rica',
  PA: 'Panama',  CU: 'Cuba', PR: 'Puerto Rico',
};

function normalizeCountry(code: string, lang: string): string {
  const map = lang === 'es' ? COUNTRY_MAP_ES : COUNTRY_MAP;
  return map[code?.toUpperCase()] ?? code;
}

type GeoResult = {
  city:      string | null;
  state:     string | null;   // nome completo: "Minas Gerais"
  stateCode: string | null;   // sigla: "MG"
  country:   string | null;   // nome PT: "Brasil"
};

export async function GET(request: NextRequest) {
  // resolverIpConfiavel/isValidIp vivem em lib/ip-utils.ts (testadas em
  // lib/ip-utils.test.ts). Esta rota usava `forwarded?.split(',')[0]` — o
  // primeiro item do x-forwarded-for, que é a parte que o cliente controla.
  // Aqui isso não abria brecha de autorização (a rota só devolve geo, não
  // decide acesso), mas produzia geolocalização errada sempre que havia mais
  // de um proxy no caminho. O valor entra concatenado na URL dos provedores
  // de geo (`https://ipwho.is/${ip}`), então também precisa ser um IP válido
  // — caso contrário dá para injetar path na requisição que o servidor faz.
  const candidate = resolverIpConfiavel(request.headers);
  const ip = isValidIp(candidate) ? candidate : '127.0.0.1';
  const local = isLocalIp(ip);
  // BUG CORRIGIDO (propagação de idioma na geolocalização): país agora respeita tc_lang.
  const lang = request.nextUrl.searchParams.get('lang') === 'es' ? 'es' : 'pt';

  const HEADERS = { 'Cache-Control': 'private, max-age=3600' };

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEDOR 1 — ip-api.com (~100ms, HTTP ok no servidor)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const ipParam = local ? '' : `/${ip}`;
    const url = `http://ip-api.com/json${ipParam}?fields=status,city,regionName,regionCode,countryCode&lang=${lang}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });

    if (res.ok) {
      const d = await res.json();
      if (d?.status === 'success' && d.countryCode) {
        const result: GeoResult = {
          city:      d.city       ?? null,
          state:     d.regionName ?? null,
          stateCode: d.regionCode ?? null,
          country:   normalizeCountry(d.countryCode, lang),
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
          country:   normalizeCountry(d.country_code, lang),
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
          country:   normalizeCountry(d.country_code, lang),
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
