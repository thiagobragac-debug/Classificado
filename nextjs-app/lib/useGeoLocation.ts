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
  // Coordenadas opcionais — nem toda fonte tem (ver detectIp/detectGps
  // abaixo). Usadas pela busca por raio em KM (lib/useAutoGeo.ts repassa
  // pra lib/services/ads.service.ts via query params).
  lat?:      number | null;
  lng?:      number | null;
  _source?:  string;
}

// BUG CORRIGIDO (propagação de idioma na geolocalização): cache agora é indexado por lang.
const CACHE_KEY = (lang: string) => `user_loc_v9_${lang}`;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — validade do valor pra pintar a tela na hora

// BUG CORRIGIDO (achado ao vivo pelo usuário: viajou ~250km de Belo
// Horizonte e o site continuou mostrando "Perto de você — Belo Horizonte"
// por até 24h, só resolvia limpando cache do navegador): o CACHE_TTL de 24h
// não era só "validade pra pintar rápido" — enquanto estivesse dentro desse
// prazo, detectLocation() nem tentava uma checagem nova por IP, então uma
// mudança real de cidade ficava invisível até o cache expirar de vez. Este
// segundo intervalo, bem mais curto, controla só a REVALIDAÇÃO em segundo
// plano (sessionStorage, por aba): o valor cacheado continua pintando a
// tela instantaneamente, mas uma checagem fresca por IP roda de qualquer
// forma no máximo 1x a cada 15min por aba — se a cidade real mudou, o
// valor exibido é atualizado sem precisar limpar nada manualmente.
const REVALIDATE_KEY = (lang: string) => `user_loc_v9_${lang}_revalidated_at`;
const REVALIDATE_INTERVAL = 15 * 60 * 1000; // 15min

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
    // Limpa junto o marcador de revalidação — sem isso, uma limpeza manual
    // logo após uma revalidação recente ficaria presa esperando os 15min
    // do REVALIDATE_INTERVAL antes de checar a localização de novo.
    sessionStorage.removeItem(REVALIDATE_KEY('pt'));
    sessionStorage.removeItem(REVALIDATE_KEY('es'));
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
        // BUG CORRIGIDO (achado ao vivo pelo usuário, plano cascata+raio):
        // coords já estava disponível aqui (é o próprio GPS!) mas era
        // descartado depois de montar a URL do Nominatim — sem isso, a
        // busca por raio em KM não tinha como funcionar nem quando o
        // usuário concede a localização precisa do navegador.
        lat: coords.lat,
        lng: coords.lon,
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

export async function detectLocation(lang: string = 'pt', force: boolean = false): Promise<GeoLoc | null> {
  // 1. Cache localStorage — pulado quando force=true (revalidação em
  // segundo plano da useGeoLocation abaixo, que precisa de uma checagem
  // de verdade por IP, não do valor já cacheado).
  if (!force) {
    try {
      const cached = localStorage.getItem(CACHE_KEY(lang));
      if (cached) {
        const { ts, loc } = JSON.parse(cached);
        if (loc && (loc.city || loc.state || loc.country) && (Date.now() - ts < CACHE_TTL)) {
          return loc as GeoLoc;
        }
      }
    } catch { /* ignore */ }
  }
  try {
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
    let cancelled = false;
    let paintedFromCache = false;

    // Tenta cache instantâneo (só pra pintar a tela sem esperar rede).
    try {
      const cached = localStorage.getItem(CACHE_KEY(lang));
      if (cached) {
        const { ts, loc } = JSON.parse(cached);
        if (loc && (loc.city || loc.state || loc.country) && (Date.now() - ts < CACHE_TTL)) {
          setGeo(loc as GeoLoc);
          setLoading(false);
          paintedFromCache = true;
        }
      }
    } catch { /* ignore */ }

    // BUG CORRIGIDO (achado ao vivo pelo usuário, viajou ~250km e ficou
    // preso na cidade antiga): antes, ter cache "fresco" (< 24h) bloqueava
    // qualquer checagem nova por IP. Agora a revalidação em segundo plano
    // roda de qualquer forma, no máximo 1x a cada REVALIDATE_INTERVAL por
    // aba (sessionStorage) — se a cidade real mudou, atualiza sozinho sem
    // precisar limpar cache manualmente.
    let shouldRevalidate = true;
    try {
      const lastCheck = sessionStorage.getItem(REVALIDATE_KEY(lang));
      if (lastCheck && Date.now() - Number(lastCheck) < REVALIDATE_INTERVAL) {
        shouldRevalidate = false;
      }
    } catch { /* ignore */ }

    if (paintedFromCache && !shouldRevalidate) {
      return;
    }

    try { sessionStorage.setItem(REVALIDATE_KEY(lang), String(Date.now())); } catch { /* ignore */ }

    detectLocation(lang, /* force */ paintedFromCache).then(loc => {
      if (cancelled) return;
      if (loc) {
        setGeo(loc);
      } else if (!paintedFromCache) {
        setGeo(null);
      }
      // Se a revalidação forçada falhar (loc null) mas já tínhamos pintado
      // do cache, mantém o valor cacheado na tela em vez de zerar pra
      // "sem localização" por causa de uma falha pontual de rede.
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [lang]);

  return { geo, loading };
}
