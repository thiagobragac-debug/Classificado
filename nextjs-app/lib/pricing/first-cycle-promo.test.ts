import { describe, it, expect } from 'vitest';
import { calcularPrecoComMaiorDesconto, planElegivelParaPromo } from './first-cycle-promo';

describe('planElegivelParaPromo', () => {
  it('reconhece Produtor PRO e Premium, mas não o plano Grátis', () => {
    expect(planElegivelParaPromo('Produtor PRO')).toBe(true);
    expect(planElegivelParaPromo('Premium')).toBe(true);
    expect(planElegivelParaPromo('Grátis')).toBe(false);
  });
});

describe('calcularPrecoComMaiorDesconto — promoção sem cupom', () => {
  it('aplica 50% quando a promo está ativa e o plano é elegível', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 79, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: false });
  });

  it('não aplica desconto quando a promo está desativada', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 79, promoAtiva: false, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 79, promoVenceu: false, cupomTemEfeito: false });
  });

  it('não aplica desconto quando o plano não é elegível (ex.: Grátis)', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 0, promoAtiva: true, planElegivel: false, useUsd: false });
    expect(r).toEqual({ finalPrice: 0, promoVenceu: false, cupomTemEfeito: false });
  });

  it('funciona igual para preço anual já anualizado (×0.8×12 já aplicado no basePrice)', () => {
    const basePriceAnual = 79 * 0.8 * 12; // 758.4
    const r = calcularPrecoComMaiorDesconto({ basePrice: basePriceAnual, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r.finalPrice).toBeCloseTo(basePriceAnual * 0.5, 2);
    expect(r.promoVenceu).toBe(true);
  });
});

describe('calcularPrecoComMaiorDesconto — cupom + promoção nunca se somam', () => {
  it('cupom pior que a promo: a promo vence', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: false,
      coupon: { discountType: 'percentage', discountValue: 10 }, // 10% off = 71.10, pior que os 50% da promo
    });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: true });
  });

  it('cupom melhor que a promo: o cupom vence', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: false,
      coupon: { discountType: 'percentage', discountValue: 70 }, // 70% off = 23.70, melhor que os 50% da promo
    });
    expect(r).toEqual({ finalPrice: 23.7, promoVenceu: false, cupomTemEfeito: true });
  });

  it('empate exato: a promoção vence (é reversível por design, cupom não é)', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: false,
      coupon: { discountType: 'percentage', discountValue: 50 }, // exatamente 50% também
    });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: true });
  });

  it('cupom fixo em BRL, sem promo ativa', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: false,
      planElegivel: true,
      useUsd: false,
      coupon: { discountType: 'fixed', discountValue: 20 },
    });
    expect(r).toEqual({ finalPrice: 59, promoVenceu: false, cupomTemEfeito: true });
  });

  it('cupom fixo em USD sem equivalente cadastrado: sem efeito, promo automática vence se ativa', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: true,
      coupon: { discountType: 'fixed', discountValue: 20, discountValueUsd: null },
    });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: false });
  });

  it('cupom fixo em USD com equivalente cadastrado, melhor que a promo', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: true,
      coupon: { discountType: 'fixed', discountValue: 20, discountValueUsd: 60 },
    });
    expect(r).toEqual({ finalPrice: 19, promoVenceu: false, cupomTemEfeito: true });
  });
});
