import { describe, it, expect } from 'vitest';
import { calcularPrecoComMaiorDesconto, planElegivelParaPromo } from './first-cycle-promo';

describe('planElegivelParaPromo', () => {
  it('reconhece Produtor PRO e Premium por nome exato (case/espaço-insensitive)', () => {
    expect(planElegivelParaPromo('Produtor PRO')).toBe(true);
    expect(planElegivelParaPromo('produtor pro')).toBe(true);
    expect(planElegivelParaPromo('  Premium  ')).toBe(true);
    expect(planElegivelParaPromo('Premium')).toBe(true);
  });

  it('NÃO reconhece o plano Grátis', () => {
    expect(planElegivelParaPromo('Grátis')).toBe(false);
  });

  it('NÃO reconhece planos com substring "pro"/"premium" mas nome diferente (achado de revisão adversarial)', () => {
    expect(planElegivelParaPromo('Premium Antigo')).toBe(false);
    expect(planElegivelParaPromo('Perfil Profissional')).toBe(false);
    expect(planElegivelParaPromo('Produtor Aprovado')).toBe(false);
  });
});

describe('calcularPrecoComMaiorDesconto — promoção sem cupom nem promotional_price', () => {
  it('aplica 50% sobre o preço cheio quando a promo está ativa e o plano é elegível', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 79, fullPrice: 79, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: false });
  });

  it('não aplica desconto quando a promo está desativada', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 79, fullPrice: 79, promoAtiva: false, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 79, promoVenceu: false, cupomTemEfeito: false });
  });

  it('não aplica desconto quando o plano não é elegível (ex.: Grátis)', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 0, fullPrice: 0, promoAtiva: true, planElegivel: false, useUsd: false });
    expect(r).toEqual({ finalPrice: 0, promoVenceu: false, cupomTemEfeito: false });
  });

  it('funciona igual para preço anual já anualizado (×0.8×12 já aplicado em basePrice e fullPrice)', () => {
    const precoAnual = 79 * 0.8 * 12; // 758.4
    const r = calcularPrecoComMaiorDesconto({ basePrice: precoAnual, fullPrice: precoAnual, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r.finalPrice).toBeCloseTo(precoAnual * 0.5, 2);
    expect(r.promoVenceu).toBe(true);
  });
});

describe('calcularPrecoComMaiorDesconto — BUG CORRIGIDO: promotional_price (desconto manual permanente) nunca soma com a promoção automática', () => {
  it('promotional_price pior que a promo automática: a promo automática vence, calculada sobre o preço CHEIO (não sobre promotional_price)', () => {
    // Plano com price=79, promotional_price=70 (desconto manual permanente já configurado no admin).
    // basePrice=70 (já reduzido por promotional_price, como o checkout monta há tempos).
    // A promoção automática precisa competir com os 70, calculando 50% sobre os 79 CHEIOS (39.5), não sobre os 70 (que daria 35, um valor diferente e incorreto).
    const r = calcularPrecoComMaiorDesconto({ basePrice: 70, fullPrice: 79, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 39.5, promoVenceu: true, cupomTemEfeito: false });
  });

  it('promotional_price melhor que a promo automática: promotional_price vence, promo automática NÃO se aplica por cima dele', () => {
    // price=79, promotional_price=30 (desconto manual mais agressivo que os 50% da promo automática, que dariam 39.5).
    const r = calcularPrecoComMaiorDesconto({ basePrice: 30, fullPrice: 79, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r).toEqual({ finalPrice: 30, promoVenceu: false, cupomTemEfeito: false });
  });

  it('cenário exato do achado da revisão adversarial: price=79, promotional_price=59 — resultado deve ser 39.50, nunca 29.50 (composição)', () => {
    const r = calcularPrecoComMaiorDesconto({ basePrice: 59, fullPrice: 79, promoAtiva: true, planElegivel: true, useUsd: false });
    expect(r.finalPrice).toBe(39.5); // NUNCA 29.5 (59*0.5), que seria os dois descontos se compondo
    expect(r.promoVenceu).toBe(true);
  });
});

describe('calcularPrecoComMaiorDesconto — cupom + promoção automática nunca se somam', () => {
  it('cupom pior que a promo: a promo vence', () => {
    const r = calcularPrecoComMaiorDesconto({
      basePrice: 79,
      fullPrice: 79,
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
      fullPrice: 79,
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
      fullPrice: 79,
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
      fullPrice: 79,
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
      fullPrice: 79,
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
      fullPrice: 79,
      promoAtiva: true,
      planElegivel: true,
      useUsd: true,
      coupon: { discountType: 'fixed', discountValue: 20, discountValueUsd: 60 },
    });
    expect(r).toEqual({ finalPrice: 19, promoVenceu: false, cupomTemEfeito: true });
  });
});
