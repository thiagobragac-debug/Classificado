import { describe, it, expect } from 'vitest';
import { montarEmailConfirmacao, montarEmailAvisoRenovacao, idiomaPorPais } from './subscription-emails';

// F11 (auditoria 12/out/2026): e-mails transacionais da assinatura. Estes testes
// travam o que o cliente é informado: valor cobrado agora, valor e data da próxima
// cobrança, e que o desconto é SÓ do 1º ciclo.

describe('idiomaPorPais', () => {
  it('Brasil, vazio e desconhecidos => pt; países hispânicos => es (case-insensitive)', () => {
    expect(idiomaPorPais('BR')).toBe('pt');
    expect(idiomaPorPais(null)).toBe('pt');
    expect(idiomaPorPais('')).toBe('pt');
    expect(idiomaPorPais('US')).toBe('pt');
    expect(idiomaPorPais('ar')).toBe('es');
    expect(idiomaPorPais(' UY ')).toBe('es');
  });
});

describe('montarEmailConfirmacao', () => {
  const proxima = new Date('2026-11-13T12:00:00Z');

  it('PRO mensal com promoção: valor pago 39,50, depois 79,00/mês na data da renovação, link para cancelar', () => {
    const m = montarEmailConfirmacao({ plano: 'Produtor PRO', ciclo: 'monthly', valorPago: 39.5, moeda: 'BRL', precoCheio: 79, proximaCobranca: proxima, idioma: 'pt' });
    expect(m.subject).toContain('Produtor PRO');
    expect(m.text).toContain('Valor cobrado agora: R$ 39,50');
    expect(m.text).toContain('50% de desconto e vale só para o 1º mês');
    expect(m.text).toContain('R$ 79,00 /mês');
    expect(m.text).toContain('13/11/2026');
    expect(m.text).toContain('/painel#billing');
  });

  it('Premium anual com promoção: 715,20 agora e 1.430,40/ano depois ("1º ano")', () => {
    const m = montarEmailConfirmacao({ plano: 'Premium', ciclo: 'annual', valorPago: 715.2, moeda: 'BRL', precoCheio: 1430.4, proximaCobranca: new Date('2027-10-13T12:00:00Z'), idioma: 'pt' });
    expect(m.text).toContain('R$ 715,20');
    expect(m.text).toContain('1º ano');
    expect(m.text).toContain('R$ 1.430,40 /ano');
    expect(m.text).toContain('13/10/2027');
  });

  it('USD (Stripe): usa o símbolo da moeda cobrada', () => {
    const m = montarEmailConfirmacao({ plano: 'Produtor PRO', ciclo: 'monthly', valorPago: 7.5, moeda: 'USD', precoCheio: 15, proximaCobranca: proxima, idioma: 'pt' });
    expect(m.text).toMatch(/US\$|\$ ?7,50/);
    expect(m.text).not.toContain('R$');
  });

  it('SEM promoção: não menciona desconto, só o valor e a próxima cobrança', () => {
    const m = montarEmailConfirmacao({ plano: 'Produtor PRO', ciclo: 'monthly', valorPago: 79, moeda: 'BRL', precoCheio: null, proximaCobranca: proxima, idioma: 'pt' });
    expect(m.text).toContain('Valor cobrado agora: R$ 79,00');
    expect(m.text).not.toContain('50%');
    expect(m.text).toContain('Próxima cobrança: 13/11/2026');
  });

  it('cupom que venceu a promoção (preço cheio guardado = pago): não anuncia desconto de 50%', () => {
    const m = montarEmailConfirmacao({ plano: 'Produtor PRO', ciclo: 'monthly', valorPago: 23.7, moeda: 'BRL', precoCheio: null, proximaCobranca: proxima, idioma: 'pt' });
    expect(m.text).not.toContain('50%');
  });

  it('espanhol: textos e formatação em es', () => {
    const m = montarEmailConfirmacao({ plano: 'Premium', ciclo: 'monthly', valorPago: 74.5, moeda: 'BRL', precoCheio: 149, proximaCobranca: proxima, idioma: 'es' });
    expect(m.subject).toContain('Suscripción');
    expect(m.text).toContain('solo para el 1.er mes');
    expect(m.text).toContain('cancelar cuando quieras');
    expect(m.text).toContain('13/11/2026');
  });
});

describe('montarEmailAvisoRenovacao', () => {
  it('mensal: avisa o valor cheio, a data, que se repete todo mês e como cancelar', () => {
    const m = montarEmailAvisoRenovacao({ plano: 'Produtor PRO', ciclo: 'monthly', valorCheio: 79, moeda: 'BRL', dataCobranca: new Date('2026-11-13T12:00:00Z'), idioma: 'pt' });
    expect(m.subject).toContain('13/11/2026');
    expect(m.subject).toContain('R$ 79,00');
    expect(m.text).toContain('valeu só para o 1º mês');
    expect(m.text).toContain('a cada mês até você cancelar');
    expect(m.text).toContain('cancele antes dessa data');
  });

  it('anual: 758,40/ano com a data de daqui a um ano', () => {
    const m = montarEmailAvisoRenovacao({ plano: 'Produtor PRO', ciclo: 'annual', valorCheio: 758.4, moeda: 'BRL', dataCobranca: new Date('2027-10-13T12:00:00Z'), idioma: 'pt' });
    expect(m.text).toContain('R$ 758,40 /ano');
    expect(m.text).toContain('1º ano');
    expect(m.text).toContain('13/10/2027');
  });

  it('espanhol', () => {
    const m = montarEmailAvisoRenovacao({ plano: 'Premium', ciclo: 'monthly', valorCheio: 149, moeda: 'BRL', dataCobranca: new Date('2026-11-13T12:00:00Z'), idioma: 'es' });
    expect(m.subject).toContain('se renueva');
    expect(m.text).toContain('cancela antes de esa fecha');
  });
});
