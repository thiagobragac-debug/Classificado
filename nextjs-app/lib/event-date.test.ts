import { describe, it, expect } from 'vitest';
import { parseEventDate } from './event-date';

// Cobertura de regressão pros bugs documentados nos comentários de
// event-date.ts — nenhum destes tinha teste automatizado antes (achado numa
// revisão de cobertura de testes, 2026-09-26): cada um só foi descoberto ao
// vivo, em produção ou em "teste de estresse final", e nada impedia uma
// mudança futura na regex de reintroduzir o mesmo bug sem ninguém notar.

describe('parseEventDate', () => {
  it('parseia data ISO diretamente (auction_events.date)', () => {
    const t = parseEventDate('2026-09-15T19:00:00+00:00');
    expect(new Date(t).toISOString()).toBe('2026-09-15T19:00:00.000Z');
  });

  it('devolve NaN pra string vazia ou sem dia+mês reconhecível', () => {
    expect(parseEventDate('')).toBeNaN();
    expect(parseEventDate('Local a definir')).toBeNaN();
    expect(parseEventDate('em breve')).toBeNaN();
  });

  it('devolve NaN quando o mês não é reconhecido (typo/idioma diferente)', () => {
    expect(parseEventDate('12 de Xyzembro 2026')).toBeNaN();
  });

  // BUG CORRIGIDO (comentário original: \D*? não-greedy) -- com \D+ (greedy)
  // o regex casava "ril" em vez de "Abril" e quebrava a extração do mês.
  it('extrai o mês corretamente mesmo com conectivo "de" antes do nome (não cai no bug do \\D+ guloso)', () => {
    const t = parseEventDate('28 de Abril a 06 de Maio', 0);
    const d = new Date(t);
    expect(d.getMonth()).toBe(3); // Abril = índice 3
    expect(d.getDate()).toBe(28); // pega o PRIMEIRO dia do intervalo
  });

  // BUG CORRIGIDO (teste de estresse final, 2026-09-02): intervalo "D1 a D2 de
  // Mês" (mesmo mês pros dois lados) escolhia o dia de FIM em vez do de
  // INÍCIO, porque \D*? não atravessa dígito e o regex genérico recuava até
  // o segundo número. Regressão direta desse achado.
  it('intervalo "D1 a D2 de Mês" (mesmo mês) pega o dia de INÍCIO, não o de fim', () => {
    const t = parseEventDate('15 a 18 de Agosto', 0);
    const d = new Date(t);
    expect(d.getMonth()).toBe(7); // Agosto = índice 7
    expect(d.getDate()).toBe(15); // não 18
  });

  it('intervalo com hífen ("D1 - D2 de Mês") também pega o dia de início', () => {
    const t = parseEventDate('2 - 6 fev 2026', 0);
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // fev = índice 1
    expect(d.getDate()).toBe(2);
  });

  it('usa o ano explícito no texto quando presente, mesmo que pareça passado', () => {
    const now = new Date(2026, 8, 26).getTime(); // 26/set/2026
    const t = parseEventDate('10 de Janeiro 2026', now);
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(10);
  });

  // Heurística de virada de ano: sem ano explícito, uma data "passada" há
  // mais de 180 dias é tratada como sendo do ano SEGUINTE (ex.: em setembro,
  // "10 de Janeiro" sem ano é o Janeiro que vem, não o de 8 meses atrás).
  it('sem ano explícito, assume o ano seguinte quando a data já passou há mais de 180 dias', () => {
    const now = new Date(2026, 8, 26).getTime(); // 26/set/2026
    const t = parseEventDate('10 de Janeiro', now);
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(10);
  });

  it('sem ano explícito, mantém o ano corrente quando a data ainda não passou (ou passou há pouco)', () => {
    const now = new Date(2026, 8, 26).getTime(); // 26/set/2026
    const t = parseEventDate('30 de Setembro', now);
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(30);
  });

  it('é case-insensitive pro nome do mês', () => {
    const t1 = parseEventDate('12 DE NOVEMBRO 2026', 0);
    const t2 = parseEventDate('12 de novembro 2026', 0);
    expect(t1).toBe(t2);
    expect(new Date(t1).getMonth()).toBe(10);
  });
});
