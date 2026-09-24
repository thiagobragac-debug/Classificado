/**
 * Geolocalização por IP — 2 provedores HTTPS em cascata. Extraído de
 * app/(public)/api/geoip/route.ts (GAP CORRIGIDO: "burlar localização para
 * contratar assinatura em outra moeda", 2026-09-01) pra poder ser reusado
 * como fonte AUTORITATIVA de país no momento de cobrar (app/api/checkout/
 * route.ts e app/api/checkout/init/route.ts), não só na pré-visualização
 * pública de preços em /planos.
 *
 * Por quê isto importa pra cobrança: profiles.country é um campo que o
 * próprio usuário edita livremente (grant de UPDATE em
 * supabase/migrations/20260824190000_restrict_profiles_privileged_columns.sql)
 * — legítimo pra exibição/preferência, mas nunca deveria decidir sozinho
 * QUAL MOEDA/GATEWAY cobra uma assinatura. Antes desta mudança, era
 * exatamente isso que acontecia: um usuário no Brasil podia setar
 * country="US" e ser cobrado em USD (ou o contrário), sem nenhuma
 * conferência contra o IP real da requisição. resolveCountryCode() é a
 * fonte de verdade nova para esse caso — profiles.country continua editável
 * e continua sendo usado pra tudo que NÃO é decisão financeira.
 *
 * BUG CRÍTICO CORRIGIDO (achado ao vivo, teste de estresse completo,
 * 2026-09-01, MESMO DIA da correção acima): a primeira versão desta correção
 * usava resolverIpConfiavel() (lib/ip-utils.ts) pra decidir QUAL IP consultar
 * — mas essa função, pensada pra rate limit/exibição (onde falhar aberto é
 * aceitável), tem um fallback pra 'x-real-ip' e pro último item de
 * 'x-forwarded-for'. Só 'x-vercel-forwarded-for' é garantidamente
 * sobrescrito pela plataforma (Vercel) antes da requisição chegar aqui — os
 * outros dois são repassados sem modificação por este app (não há proxy
 * reverso adicional na frente que os defina de verdade), então um cliente
 * podia simplesmente mandar o header 'X-Real-IP: <qualquer IP>' e reabrir
 * EXATAMENTE o mesmo bypass de moeda/gateway que a correção original dizia
 * ter fechado. Confirmado ao vivo contra este mesmo dev server: sem header
 * resolve Brasil, com 'x-real-ip: 8.8.8.8' resolve Estados Unidos. Por isso
 * a resolução de IP usada AQUI (decisão financeira) é deliberadamente mais
 * estrita que a de app/(public)/api/geoip/route.ts (só exibição, onde o
 * fallback mais permissivo de resolverIpConfiavel continua correto/desejado
 * — maximiza detecção fora da Vercel sem nenhum risco financeiro) — ver
 * resolverIpAutoritativo() abaixo, que não tem fallback nenhum.
 */
import { resolverIpConfiavel, isValidIp, isLocalIp } from '@/lib/ip-utils';

/**
 * Só pra decisões financeiras (checkout). Deliberadamente SEM fallback pra
 * 'x-real-ip'/'x-forwarded-for' — ver comentário grande no topo do arquivo.
 * Ausência do header vira `null` (mesma filosofia de resolverIpConfiavel:
 * "não dá pra saber o IP com confiança" é tratado pelo chamador via
 * fallback pra profiles.country, nunca como "assume nacional" ou
 * "assume internacional" às cegas).
 *
 * BUG CRÍTICO CORRIGIDO (migração Vercel -> Render, achado ao vivo,
 * 2026-09-24): x-vercel-forwarded-for nunca é setado fora da Vercel — no
 * Render este header chega sempre vazio, fazendo resolveCountryCode()
 * devolver `null` SEMPRE, e o checkout cair pro fallback de
 * profiles.country em TODA requisição (reabrindo silenciosamente o exploit
 * de moeda/gateway documentado no topo deste arquivo). Confirmado ao vivo
 * via endpoint de debug temporário: cf-connecting-ip chega com o IP real do
 * cliente em toda requisição de produção. Tem a mesma garantia de
 * plataforma que x-vercel-forwarded-for tinha — o Cloudflare que fica na
 * frente de 100% do tráfego do Render sobrescreve esse header na borda a
 * cada requisição, então o cliente não consegue forjá-lo (comportamento
 * documentado do Cloudflare, não uma suposição). Mantém
 * x-vercel-forwarded-for como alternativa secundária (redeploy futuro na
 * Vercel, preview env) — continua sem cair pra x-real-ip/x-forwarded-for
 * aqui, essa estrita ausência de fallback é o ponto central deste
 * comentário desde a correção original.
 */
function resolverIpAutoritativo(headers: Headers): string | null {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;

  const vercel = headers.get('x-vercel-forwarded-for')?.trim();
  if (!vercel) return null;
  const ultimo = vercel.split(',').pop()?.trim();
  return ultimo || null;
}

const COUNTRY_MAP: Record<string, string> = {
  BR: 'Brasil', UY: 'Uruguai', AR: 'Argentina',
  PY: 'Paraguai', CL: 'Chile', CO: 'Colômbia',
  PE: 'Peru',    BO: 'Bolívia', VE: 'Venezuela',
  EC: 'Equador', US: 'Estados Unidos', PT: 'Portugal',
  MX: 'México',  DO: 'República Dominicana', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicarágua', CR: 'Costa Rica',
  PA: 'Panamá',  CU: 'Cuba', PR: 'Porto Rico',
};

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

export type GeoResult = {
  city:        string | null;
  state:       string | null;
  stateCode:   string | null;
  country:     string | null;   // nome localizado: "Brasil" / "Estados Unidos"
  countryCode: string | null;   // ISO-2 cru: "BR"
  // BUG CORRIGIDO (achado ao vivo pelo usuário, plano cascata+raio): os 3
  // provedores já devolvem latitude/longitude — só nunca eram lidos. Sem
  // isso, a busca por raio em KM (lib/services/ads.service.ts) não tinha
  // como saber onde o visitante está quando o GPS do navegador é negado
  // (o caso mais comum — só o IP fica disponível).
  lat: number | null;
  lng: number | null;
};

/**
 * Cascata de 2 provedores HTTPS pra um IP já resolvido (havia um 3º, HTTP
 * puro — ver comentário no fim da função, removido em 2026-09-24).
 * Compartilhada entre resolveGeo() (exibição, IP via resolverIpConfiavel —
 * trust chain mais permissiva, falha aberta) e resolveCountryCode()
 * (cobrança, IP via resolverIpAutoritativo — só cf-connecting-ip/
 * x-vercel-forwarded-for, sem fallback).
 */
async function lookupByIp(ip: string, local: boolean, lang: 'pt' | 'es'): Promise<GeoResult | null> {
  try {
    const url = local ? 'https://ipwho.is/' : `https://ipwho.is/${ip}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const d = await res.json();
      if (d?.success && d.country_code) {
        return {
          city: d.city ?? null,
          state: d.region ?? null,
          stateCode: d.region_code ?? null,
          country: normalizeCountry(d.country_code, lang),
          countryCode: d.country_code.toUpperCase(),
          lat: typeof d.latitude === 'number' ? d.latitude : null,
          lng: typeof d.longitude === 'number' ? d.longitude : null,
        };
      }
    }
  } catch (e) {
    console.warn('[geoip] ipwho.is falhou:', e);
  }

  try {
    const url = local ? 'https://ipapi.co/json/' : `https://ipapi.co/${ip}/json/`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TauzeClass/1.0' }, signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const d = await res.json();
      if (d && !d.error && d.country_code) {
        return {
          city: d.city ?? null,
          state: d.region ?? null,
          stateCode: d.region_code ?? null,
          country: normalizeCountry(d.country_code, lang),
          countryCode: d.country_code.toUpperCase(),
          lat: typeof d.latitude === 'number' ? d.latitude : null,
          lng: typeof d.longitude === 'number' ? d.longitude : null,
        };
      }
    }
  } catch (e) {
    console.warn('[geoip] ipapi.co falhou:', e);
  }

  // BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
  // 2026-09-24): havia um 3º provedor aqui (ip-api.com) em HTTP PURO — sem
  // TLS, o IP do visitante ia em texto claro pra internet, e a resposta
  // (usada até na decisão financeira via resolveCountryCode) não tinha
  // nenhuma verificação de integridade contra adulteração on-path.
  // Confirmado ao vivo que não dá pra só trocar pra https://: o tier
  // gratuito do ip-api.com recusa HTTPS (`curl -s https://ip-api.com/...`
  // devolve 403/"status":"fail" — HTTPS só no plano Pro pago deles).
  // Removido em vez de mantido quebrado — os outros 2 provedores (ipwho.is,
  // ipapi.co) já são HTTPS; perder o 3º só torna ligeiramente mais provável
  // cair no fallback de profiles.country (resolveCountryCode) ou "sem
  // localização" (resolveGeo), nunca um novo risco de segurança.
  console.warn('[geoip] todos os provedores falharam para IP:', ip);
  return null;
}

/**
 * Geolocalização pra EXIBIÇÃO (usada por app/(public)/api/geoip/route.ts,
 * pré-visualização pública de preços em /planos). IP via resolverIpConfiavel
 * (lib/ip-utils.ts) — trust chain mais permissiva (inclui x-real-ip e
 * x-forwarded-for), falha aberta é aceitável aqui porque o pior caso é
 * mostrar a moeda "sugerida" errada antes do login, nunca cobrar errado (o
 * checkout real sempre resolve o país de novo, com a cadeia estrita — ver
 * resolveCountryCode abaixo).
 */
export async function resolveGeo(headers: Headers, lang: 'pt' | 'es' = 'pt'): Promise<GeoResult | null> {
  const candidate = resolverIpConfiavel(headers);
  const ip: string = candidate && isValidIp(candidate) ? candidate : '127.0.0.1';
  return lookupByIp(ip, isLocalIp(ip), lang);
}

/**
 * Geolocalização pra DECISÃO FINANCEIRA (checkout — qual gateway/moeda
 * cobra). IP via resolverIpAutoritativo (só x-vercel-forwarded-for, sem
 * fallback pra headers forjáveis pelo cliente — ver o comentário grande no
 * topo do arquivo). Sem esse header (dev local, ou uma plataforma que não
 * seja Vercel), devolve `null` — quem chama (app/api/checkout/route.ts,
 * app/api/checkout/init/route.ts, app/api/checkout/tokenize-card/route.ts)
 * cai pro fallback de profiles.country nesse caso, nunca assume nacional ou
 * internacional às cegas. Nunca lança — falha de rede/timeout em qualquer
 * provedor também vira `null` e aciona o mesmo fallback.
 */
export async function resolveCountryCode(headers: Headers): Promise<string | null> {
  const ip = resolverIpAutoritativo(headers);
  if (!ip || !isValidIp(ip)) return null;
  const geo = await lookupByIp(ip, isLocalIp(ip), 'pt');
  return geo?.countryCode ?? null;
}
