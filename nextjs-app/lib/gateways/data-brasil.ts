// Datas em America/Sao_Paulo, independentes do fuso do processo.
//
// O Render roda em UTC: `new Date().getDate()` entre 21h e 23h59 de Brasília já
// devolve o dia SEGUINTE. Os gateways nacionais (Pagar.me billing_day, Asaas
// nextDueDate) interpretam datas no calendário brasileiro, então usar o fuso do
// servidor deslocava a 1ª cobrança "imediata" para o dia seguinte nessa janela
// (F14/F17 da auditoria de 12/out/2026).
const FMT_DATA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' no calendário de Brasília. */
export function dataBrasilISO(d: Date = new Date()): string {
  return FMT_DATA.format(d)
}

/** Dia do mês (1-31) no calendário de Brasília. */
export function diaDoMesBrasil(d: Date = new Date()): number {
  return Number(dataBrasilISO(d).slice(8, 10))
}
