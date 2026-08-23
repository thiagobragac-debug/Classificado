const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/ad-images/`;

export function imageUrl(path: string | null | undefined, fallback = '/assets/hero_farm.webp'): string {
  if (!path) return fallback;
  if (path.startsWith('http')) {
    // Validar schema para prevenir javascript:// ou data:
    try {
      const parsed = new URL(path);
      if (!['https:', 'http:'].includes(parsed.protocol)) return fallback;
    } catch {
      return fallback;
    }
    return path;
  }
  return `${STORAGE_BASE}${path}`;
}
