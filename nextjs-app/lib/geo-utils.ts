export function normalizeCountry(country: string | undefined | null): string | undefined {
  if (!country) return undefined;
  if (country.includes('Brasil') || country === 'Brazil' || country === 'BR') return 'Brasil';
  if (country.includes('Argentina')) return 'Argentina';
  if (country.includes('Uruguai')) return 'Uruguai';
  if (country.includes('Paraguai')) return 'Paraguai';
  return country;
}
