// BUG CORRIGIDO (validação adversarial final): esta cópia tinha divergido do
// normalizeCountry de app/(public)/anunciar/_components/StepLocation.tsx —
// faltavam as grafias em espanhol/inglês de Uruguai/Paraguai ('Uruguay',
// 'Paraguay', usadas por provedores de geo como ipapi.co) e o fallback
// devolvia a string bruta em vez de undefined pra valor não reconhecido. O
// único chamador (app/(public)/anunciar/page.tsx) usa isso pra pré-preencher
// o <select> de país do wizard — StepLocation.tsx só tem as 4 options
// canônicas em PT, então uma string bruta não reconhecida ficava presa sem
// bater com nenhuma <option>, o mesmo bug de raiz que motivou o retorno
// null/undefined lá.
export function normalizeCountry(country: string | undefined | null): string | undefined {
  if (!country) return undefined;
  if (country.includes('Brasil') || country === 'Brazil' || country === 'BR') return 'Brasil';
  if (country.includes('Argentina')) return 'Argentina';
  if (country.includes('Uruguai') || country.includes('Uruguay')) return 'Uruguai';
  if (country.includes('Paraguai') || country.includes('Paraguay')) return 'Paraguai';
  return undefined;
}
