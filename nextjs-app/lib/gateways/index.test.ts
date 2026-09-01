import { describe, it, expect } from 'vitest';
import { selectGateway, isNativePlanSwitchEligible } from './index';

describe('selectGateway', () => {
  it('usuário nacional (BR) sem país informado usa o default nacional', () => {
    expect(selectGateway(undefined, 'mercadopago', 'stripe')).toBe('mercadopago');
    expect(selectGateway(null, 'mercadopago', 'stripe')).toBe('mercadopago');
  });

  it('reconhece "BR" e "BRASIL" em qualquer caixa como nacional', () => {
    expect(selectGateway('br', 'pagarme', 'stripe')).toBe('pagarme');
    expect(selectGateway('Brasil', 'pagarme', 'stripe')).toBe('pagarme');
    expect(selectGateway('BRASIL', 'pagarme', 'stripe')).toBe('pagarme');
  });

  it('nacional aceita os 4 gateways válidos', () => {
    for (const g of ['stripe', 'mercadopago', 'pagarme', 'asaas'] as const) {
      expect(selectGateway('BR', g, 'stripe')).toBe(g);
    }
  });

  it('nacional cai para mercadopago se o default configurado for inválido', () => {
    expect(selectGateway('BR', 'gateway-inexistente', 'stripe')).toBe('mercadopago');
  });

  it('internacional só aceita stripe ou mercadopago', () => {
    expect(selectGateway('US', 'stripe', 'stripe')).toBe('stripe');
    expect(selectGateway('US', 'stripe', 'mercadopago')).toBe('mercadopago');
  });

  it('internacional cai para stripe se o default for pagarme/asaas (não suportados fora do Brasil)', () => {
    expect(selectGateway('US', 'stripe', 'pagarme')).toBe('stripe');
    expect(selectGateway('AR', 'stripe', 'asaas')).toBe('stripe');
  });

  it('internacional cai para stripe se o default configurado for inválido', () => {
    expect(selectGateway('US', 'stripe', 'gateway-inexistente')).toBe('stripe');
  });
});

// Espelha exatamente a condição de elegibilidade de troca nativa de plano em
// app/api/checkout/route.ts (gatewaySuportaTrocaNativa + o if que decide
// entrar no bloco de updateSubscriptionPlan) — usada por
// app/api/checkout/init/route.ts pra PREVER se o CheckoutModal pode pular a
// coleta de dados de cobrança/cartão. Estes casos servem de rede de
// segurança contra as duas lógicas divergirem sem que ninguém perceba.
describe('isNativePlanSwitchEligible', () => {
  const base = {
    existingSubGateway: 'stripe',
    existingSubGatewayId: 'sub_123',
    existingSubPrice: 49.9,
    existingSubCurrency: 'BRL',
    targetGatewayName: 'stripe' as const,
    targetCurrency: 'BRL',
    finalPrice: 149.9,
  };

  it('Stripe elegível tanto em upgrade quanto em downgrade', () => {
    expect(isNativePlanSwitchEligible(base)).toBe(true);
    expect(isNativePlanSwitchEligible({ ...base, finalPrice: 19.9 })).toBe(true);
  });

  it('Mercado Pago/Pagar.me/Asaas só são elegíveis em downgrade (sem proração)', () => {
    for (const gw of ['mercadopago', 'pagarme', 'asaas'] as const) {
      expect(isNativePlanSwitchEligible({ ...base, existingSubGateway: gw, targetGatewayName: gw, finalPrice: 19.9 })).toBe(true);
      expect(isNativePlanSwitchEligible({ ...base, existingSubGateway: gw, targetGatewayName: gw, finalPrice: 149.9 })).toBe(false);
    }
  });

  it('gateway diferente do da assinatura atual nunca é elegível', () => {
    expect(isNativePlanSwitchEligible({ ...base, existingSubGateway: 'mercadopago' })).toBe(false);
  });

  it('sem gateway_subscription_id (ex.: ativada via cupom 100% off) nunca é elegível', () => {
    expect(isNativePlanSwitchEligible({ ...base, existingSubGatewayId: null })).toBe(false);
  });

  it('cupom de 100% off (finalPrice <= 0) nunca é elegível, mesmo na Stripe', () => {
    expect(isNativePlanSwitchEligible({ ...base, finalPrice: 0 })).toBe(false);
  });

  it('sem assinatura anterior (existingSubGateway ausente) nunca é elegível', () => {
    expect(isNativePlanSwitchEligible({ ...base, existingSubGateway: null, existingSubGatewayId: null })).toBe(false);
  });

  // BUG CORRIGIDO (achado ao vivo, teste completo de pagamento, 2026-09-01):
  // uma assinatura Stripe fica travada na moeda da 1ª cobrança — trocar pra
  // um plano de moeda diferente via update in-place é rejeitado pela API de
  // verdade (confirmado ao vivo), então nunca é "troca nativa elegível",
  // mesmo com mesmo gateway/preço — precisa cair no fallback de
  // cancelar-e-criar (que gera Customer/Product novos, na moeda certa).
  it('moeda diferente da assinatura atual nunca é elegível, mesmo com mesmo gateway', () => {
    expect(isNativePlanSwitchEligible({ ...base, existingSubCurrency: 'USD', targetCurrency: 'BRL' })).toBe(false);
    expect(isNativePlanSwitchEligible({ ...base, existingSubCurrency: 'BRL', targetCurrency: 'USD' })).toBe(false);
  });
});
