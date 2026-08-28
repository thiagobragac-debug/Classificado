/**
 * useGeoLocation — detecção em cascata idêntica ao ambiente 8080 original.
 * Provedor 1: GPS do dispositivo + Nominatim (mais preciso, pede permissão)
 * Provedor 2: API de IP (server-side, sem CORS, sem permissão)
 * Race strategy: tenta GPS primeiro, se demorar usa IP.
 */
'use client';

import { useState, useEffect } from 'react';

export interface GeoLoc {
  city:      string | null;
  state:     string | null;
  stateCode: string | null;
  country:   string | null;
  _source?:  string;
}

// BUG CORRIGIDO (propagação de idioma na geolocalização): cache agora é indexado por lang.
const CACHE_KEY = (lang: string) => `user_loc_v9_${lang}`;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// BUG CORRIGIDO (revisão adversarial da propagação de idioma): a chave real
// de cache virou versionada por idioma (user_loc_v9_pt/es), mas 3 outros
// pontos do app que limpam esse cache manualmente (ao usuário remover o
// filtro de país/localização) continuavam removendo a chave morta
// 'user_loc_v8' — o cache real nunca era apagado, reabrindo o bug de
// auto-geo reaplicar sozinho a localização após o usuário limpá-la.
// Centralizado aqui pra não divergir de novo na próxima mudança de versão.
export function clearGeoCache() {
  try {
    localStorage.removeItem(CACHE_KEY('pt'));
    localStorage.removeItem(CACHE_KEY('es'));
  } catch { /* ignore */ }
}

export const normalizeStr = (s: string | null | undefined): string =>
  s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

const withTimeout = <T>(promise: Promise<T>, ms: number) => 
  Promise.race([
    promise,
    new Promise<null>(res => setTimeout(() => res(null), ms))
  ]);

async function detectGps(lang: string = 'pt'): Promise<GeoLoc | null> {
  try {
    const coords = await withTimeout<{lat: number, lon: number} | null>(
      new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('no geo'));
        navigator.geolocation.getCurrentPosition(
          pos => res({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          err => rej(err),
          { timeout: 5000, maximumAge: 3600000 }
        );
      }),
      6000
    );

    if (!coords) return null;

    const geo: any = await withTimeout(
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json&accept-language=${lang}`)
        .then(r => r.ok ? r.json() : null),
      5000
    );

    if (geo && geo.address) {
      return {
        city: geo.address.city || geo.address.town || geo.address.village || null,
        state: geo.address.state || null,
        stateCode: null, // fallback matching vai ser por nome no AdsBrowser
        country: geo.address.country || null,
        _source: 'gps+nominatim'
      };
    }
  } catch { /* ignore */ }
  return null;
}

async function detectIp(lang: string = 'pt'): Promise<GeoLoc | null> {
  try {
    const res = await fetch(`/api/geoip?lang=${lang}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data: GeoLoc = await res.json();
      if (data && (data.city || data.state || data.country)) {
        data._source = 'api/geoip';
        return data;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export async function detectLocation(lang: string = 'pt'): Promise<GeoLoc | null> {
  // 1. Cache localStorage
  try {
    const cached = localStorage.getItem(CACHE_KEY(lang));
    if (cached) {
      const { ts, loc } = JSON.parse(cached);
      if (loc && (loc.city || loc.state || loc.country) && (Date.now() - ts < CACHE_TTL)) {
        return loc as GeoLoc;
      }
    }
    // Clean old caches
    ['user_loc_v8', 'user_loc_v7', 'user_loc_v6', 'user_loc_v5', 'user_loc_v4'].forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }

  const save = (loc: GeoLoc): GeoLoc => {
    try { localStorage.setItem(CACHE_KEY(lang), JSON.stringify({ ts: Date.now(), loc })); } catch { /* ignore */ }
    return loc;
  };

  // 2. Estratégia PARALELA com hierarquia de qualidade
  // O GPS tenta detectar (precisão de metros), mas pede permissão do browser
  // O IP é fallback imediato se o usuário negar o GPS ou se demorar mais de 2s
  try {
    const ipPromise = detectIp(lang).catch(() => null);
    const gpsPromise = detectGps(lang).catch(() => null);

    const winner = await Promise.race([
      gpsPromise,
      new Promise<GeoLoc | null>(res => setTimeout(async () => res(await ipPromise), 2000))
    ]);

    if (winner && (winner.city || winner.state || winner.country)) {
      return save(winner);
    }

    // Se a corrida do setTimeout ganhou mas o IP era nulo, tenta aguardar o GPS
    const lateGps = await gpsPromise;
    if (lateGps && (lateGps.city || lateGps.state || lateGps.country)) return save(lateGps);

    // Se GPS também falhou/foi negado, tenta aguardar o IP
    const lateIp = await ipPromise;
    if (lateIp && (lateIp.city || lateIp.state || lateIp.country)) return save(lateIp);

  } catch { /* ignore */ }

  return null;
}

/**
 * Hook que detecta a localização do usuário.
 * Retorna { geo, loading }.
 */
export function useGeoLocation(lang: string = 'pt') {
  const [geo, setGeo] = useState<GeoLoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Tenta cache instantâneo
    try {
      const cached = localStorage.getItem(CACHE_KEY(lang));
      if (cached) {
        const { ts, loc } = JSON.parse(cached);
        if (loc && (loc.city || loc.state || loc.country) && (Date.now() - ts < CACHE_TTL)) {
          setGeo(loc as GeoLoc);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    // Detecção assíncrona
    detectLocation(lang).then(loc => {
      setGeo(loc);
      setLoading(false);
    });
  }, [lang]);

  return { geo, loading };
}
