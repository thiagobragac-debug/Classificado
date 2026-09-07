// Mensagens da cascata automática de localização (ver
// getAdsListagemComFallbackGeografico em lib/services/ads.service.ts).
// Isomorfo (sem next/headers, sem Node-only APIs) — importável tanto do
// lado servidor (ads.service.ts) quanto de componentes cliente, se algum
// dia precisar montar a mesma mensagem fora do server.

export type GeoFallbackLevel = 'radius_close' | 'radius_wide' | 'city' | 'state' | 'country' | 'all';

// Escada de raio em KM — só usada quando a localização do visitante tem
// coordenadas (GPS ou IP-geo, ambos passam a carregar lat/lng — ver
// lib/useGeoLocation.ts / lib/geoip.ts). Substitui o match exato de cidade
// como critério padrão de "Perto de você"; sem coordenadas, cai na escada
// de texto (cidade→estado→país→tudo) como antes.
export const RADIUS_CLOSE_KM = 100;
export const RADIUS_WIDE_KM = 300;

export interface GeoFallbackInfo {
  level: GeoFallbackLevel;
  fromLabel: string;
  toLabel: string | null;
}

type Lang = 'pt' | 'es';

const MESSAGES: Record<Lang, {
  toPlace: (from: string, to: string) => string;
  toAll: (from: string) => string;
}> = {
  pt: {
    toPlace: (from, to) => `Nenhum anúncio em ${from} — exibindo resultados de ${to}`,
    toAll: (from) => `Nenhum anúncio em ${from} — exibindo todos os anúncios`,
  },
  es: {
    toPlace: (from, to) => `Ningún anuncio en ${from} — mostrando resultados de ${to}`,
    toAll: (from) => `Ningún anuncio en ${from} — mostrando todos los anuncios`,
  },
};

export function buildGeoFallbackMessage(info: GeoFallbackInfo, lang: Lang = 'pt'): string {
  const T = MESSAGES[lang] || MESSAGES.pt;
  if (info.level === 'all' || !info.toLabel) return T.toAll(info.fromLabel);
  return T.toPlace(info.fromLabel, info.toLabel);
}
