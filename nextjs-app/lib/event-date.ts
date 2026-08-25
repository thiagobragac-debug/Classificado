const MESES: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

// Extraído de app/(public)/eventos/page.tsx (2026-08-25) para ser
// compartilhado com EventCard.tsx — antes existiam 2 regexes independentes
// pra achar dia+mês num texto livre (um pra ordenação aqui, outro mais
// simples só pro badge do card), e eles foram divergindo: o do card não
// pulava conectivos ("de", "a") antes do nome do mês, então "12 de
// Novembro" virava badge "12 DE" em vez de "12 NOV". Uma função só, usada
// nos dois lugares, evita esse tipo de bug voltar a acontecer.
export function parseEventDate(dateStr: string, now: number = Date.now()): number {
  const iso = new Date(dateStr).getTime();
  if (!isNaN(iso)) return iso;

  // \D*? (não-greedy) é essencial aqui: com \D+ (greedy) o backtracking do
  // regex casava "ril" em vez de "Abril" pra datas tipo "28 de Abril a 06
  // de Maio" (a busca greedy consome tudo e recua de trás pra frente até
  // achar 3+ letras, o que pode acertar o MEIO da palavra do mês em vez do
  // início).
  const match = dateStr.match(/(\d{1,2})\D*?([a-zA-Zç]{3,})/i);
  if (!match) return NaN;
  const day = parseInt(match[1], 10);
  const monthKey = match[2].toLowerCase().slice(0, 3);
  const month = MESES[monthKey];
  if (month === undefined || isNaN(day)) return NaN;

  const yearMatch = dateStr.match(/\b(20\d{2})\b/);
  const currentYear = new Date(now).getFullYear();
  const year = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;

  let parsed = new Date(year, month, day).getTime();
  // Sem ano explícito no texto e a data "já passou" há mais de 6 meses:
  // provavelmente é do ano seguinte (ex.: em dezembro, "12 de Janeiro" é
  // do ano que vem, não já ocorrido há quase um ano).
  if (!yearMatch && parsed < now - 180 * 86400000) {
    parsed = new Date(year + 1, month, day).getTime();
  }
  return parsed;
}
