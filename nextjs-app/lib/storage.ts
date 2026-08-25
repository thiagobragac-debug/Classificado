const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/ad-images/`;

// Mesma allowlist de hosts de nextjs-app/next.config.ts > images.remotePatterns
// (exceto o domínio do Supabase, tratado à parte pelo endsWith abaixo — se um
// host novo for liberado lá, precisa ser liberado aqui também.
const ALLOWED_IMAGE_HOSTS = ['lh3.googleusercontent.com', 'images.unsplash.com', 'via.placeholder.com'];

function isAllowedImageHost(hostname: string): boolean {
  if (hostname === 'supabase.co' || hostname.endsWith('.supabase.co')) return true;
  return ALLOWED_IMAGE_HOSTS.includes(hostname);
}

export function imageUrl(path: string | null | undefined, fallback = '/assets/hero_farm.webp'): string {
  if (!path) return fallback;
  if (path.startsWith('http')) {
    // GAP DE RESILIÊNCIA CORRIGIDO (auditoria completa, 2026-08-25): esta
    // função validava só o protocolo (http/https), não o host — uma URL de
    // imagem de anúncio/evento hospedada fora de next.config.ts >
    // images.remotePatterns fazia o next/image lançar uma exceção síncrona
    // não tratada, que sobe até o error boundary de NÍVEL DE PÁGINA (não
    // isolado por card) e derruba a Home/página de anúncio inteira pra
    // qualquer visitante — bastava um vendedor colar uma URL de imagem de
    // um host não cadastrado. Agora valida o host contra a mesma allowlist
    // do next.config.ts antes de deixar passar; caso contrário usa o
    // fallback local, que nunca falha.
    try {
      const parsed = new URL(path);
      if (!['https:', 'http:'].includes(parsed.protocol)) return fallback;
      if (!isAllowedImageHost(parsed.hostname)) return fallback;
    } catch {
      return fallback;
    }
    return path;
  }
  return `${STORAGE_BASE}${path}`;
}
