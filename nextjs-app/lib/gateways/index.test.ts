import { describe, it, expect } from 'vitest';
import { selectGateway } from './index';

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
