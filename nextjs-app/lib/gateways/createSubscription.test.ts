import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripeAdapter } from './stripe';
import { asaasAdapter } from './asaas';
import { pagarmeAdapter } from './pagarme';
import type { GatewayPlan, GatewayUser, PaymentData } from './types';

// Testa a FORMA da requisição que cada adapter monta para criar uma
// assinatura — com fetch mockado, sem rede real. Cobre diretamente os dois
// achados mais graves da auditoria: Stripe usava um campo que não existe na
// Subscriptions API (product_data em vez de product), e Asaas não enviava o
// campo obrigatório remoteIp nem buscava cliente existente antes de criar.

const PLAN: GatewayPlan = { id: 'plan_1', name: 'Produtor PRO', price: 79, billingCycle: 'monthly' };
const USER: GatewayUser = { id: 'user_1', email: 'user@teste.com', name: 'Usuário Teste' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stripeAdapter.createSubscription — forma da requisição', () => {
  it('cria um Product e usa items[0][price_data][product], nunca product_data', async () => {
    const chamadas: { url: string; body: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      chamadas.push({ url, body: init.body, headers: init.headers });
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus_123' }) };
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_123' }) };
      if (url.includes('/v1/subscriptions')) return { ok: true, json: async () => ({ id: 'sub_123' }) };
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = stripeAdapter('sk_test_fake');
    const paymentData: PaymentData = { method: 'card', gatewayToken: 'pm_abc123' };
    const result = await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_1');

    expect(result.gatewaySubscriptionId).toBe('sub_123');

    const chamadaProduto = chamadas.find((c) => c.url.includes('/v1/products'));
    expect(chamadaProduto).toBeTruthy();
    expect(chamadaProduto!.body).toContain('name=Produtor');

    const chamadaSub = chamadas.find((c) => c.url.includes('/v1/subscriptions'));
    expect(chamadaSub!.body).toContain('items%5B0%5D%5Bprice_data%5D%5Bproduct%5D=prod_123');
    // Regressão direta do bug corrigido: nunca mais enviar product_data aqui.
    expect(chamadaSub!.body).not.toContain('product_data');

    // Idempotency-Key também na criação do Customer e do Product, não só na
    // da Subscription (achado de auditoria sobre idempotência parcial).
    const chamadaCustomer = chamadas.find((c) => c.url.includes('/v1/customers'));
    expect(chamadaCustomer!.headers['Idempotency-Key']).toBeTruthy();
    expect(chamadaProduto!.headers['Idempotency-Key']).toBeTruthy();
    expect(chamadaSub!.headers['Idempotency-Key']).toBeTruthy();
  });

  it('propaga erro claro se a criação do Product falhar', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus_123' }) };
      if (url.includes('/v1/products')) return { ok: false, text: async () => 'product creation failed' };
      throw new Error('não deveria chegar em subscriptions');
    }));
    const adapter = stripeAdapter('sk_test_fake');
    await expect(
      adapter.createSubscription(PLAN, USER, { method: 'card', gatewayToken: 'pm_abc' }, 'checkout_2')
    ).rejects.toThrow('Stripe erro ao criar produto');
  });
});

describe('asaasAdapter.createSubscription — forma da requisição', () => {
  const paymentData: PaymentData = {
    method: 'card',
    creditCard: { number: '4111111111111111', holderName: 'Teste', expMonth: '12', expYear: '2030', cvv: '123' },
    billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
    doc: '12345678909',
    phone: '11999999999',
    ip: '203.0.113.9',
  };

  it('rejeita sem paymentData.ip — remoteIp é obrigatório na Asaas', async () => {
    const adapter = asaasAdapter('ak_test', 'sandbox');
    const { ip, ...semIp } = paymentData;
    await expect(adapter.createSubscription(PLAN, USER, semIp, 'checkout_3')).rejects.toThrow('IP do cliente é obrigatório');
  });

  it('busca cliente por externalReference ANTES de tentar criar (nunca cria primeiro)', async () => {
    const chamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url.includes('/customers?externalReference=')) {
        return { ok: true, json: async () => ({ data: [{ id: 'cus_existente' }] }) };
      }
      if (url.includes('/subscriptions')) return { ok: true, json: async () => ({ id: 'sub_1' }) };
      throw new Error('Não deveria chamar POST /customers quando a busca já encontrou o cliente: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    const result = await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_4');

    expect(result.gatewayCustomerId).toBe('cus_existente');
    expect(chamadas.some((u) => u.includes('/customers') && !u.includes('?'))).toBe(false);
  });

  it('cria cliente só depois de buscar por externalReference E por cpfCnpj sem achar nada', async () => {
    const metodos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      metodos.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('externalReference=')) return { ok: true, json: async () => ({ data: [] }) };
      if (url.includes('cpfCnpj=')) return { ok: true, json: async () => ({ data: [] }) };
      if ((init?.method || 'GET') === 'POST' && url.endsWith('/customers')) {
        return { ok: true, json: async () => ({ id: 'cus_novo' }) };
      }
      if (url.includes('/subscriptions')) return { ok: true, json: async () => ({ id: 'sub_2' }) };
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    const result = await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_5');
    expect(result.gatewayCustomerId).toBe('cus_novo');
    // As duas buscas aconteceram ANTES do POST de criação.
    const idxBuscaRef = metodos.findIndex((m) => m.includes('externalReference='));
    const idxCriacao = metodos.findIndex((m) => m.startsWith('POST') && m.includes('/customers'));
    expect(idxBuscaRef).toBeGreaterThanOrEqual(0);
    expect(idxCriacao).toBeGreaterThan(idxBuscaRef);
  });

  it('inclui remoteIp e User-Agent na criação da assinatura', async () => {
    let bodySubscription = '';
    let headersSubscription: Record<string, string> = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_1' }] }) };
      if (url.includes('/subscriptions')) {
        bodySubscription = init.body;
        headersSubscription = init.headers;
        return { ok: true, json: async () => ({ id: 'sub_3' }) };
      }
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_6');

    const parsed = JSON.parse(bodySubscription);
    expect(parsed.remoteIp).toBe('203.0.113.9');
    expect(headersSubscription['User-Agent']).toBeTruthy();
  });

  it('usa a URL de sandbox documentada atualmente (api-sandbox.asaas.com/v3)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => ({ data: [{ id: 'cus_1' }] }) };
    }));
    const adapter = asaasAdapter('ak_test', 'sandbox');
    try {
      await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_7');
    } catch {
      // Só nos importa a URL da primeira chamada, não o fluxo completo.
    }
    expect(urls[0]).toContain('https://api-sandbox.asaas.com/v3');
    expect(urls[0]).not.toContain('sandbox.asaas.com/api/v3');
  });

  // Achado desta sessão: app/api/checkout/route.ts rejeita com 400 qualquer
  // requisição com creditCard em claro (proteção de escopo PCI), mas o
  // createSubscription acima SEMPRE exigia paymentData.creditCard — ou seja,
  // uma assinatura Asaas por cartão nunca completava pela rota real, com
  // qualquer chave. Confirmado ao vivo contra o sandbox real em 2026-08-24.
  // tokenizeCard (chamado só por app/api/checkout/tokenize-card, a única
  // exceção ao guard de PCI) isola a única janela em que o cartão em claro
  // toca o servidor, e devolve um creditCardToken que substitui creditCard
  // por completo na criação da assinatura.
  it('tokenizeCard: busca/cria customer e devolve creditCardToken, sem persistir nada', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      chamadas.push({ url, body: init?.body });
      if (url.includes('externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_tok' }] }) };
      if (url.includes('/creditCard/tokenizeCreditCard')) {
        return { ok: true, json: async () => ({ creditCardToken: 'tok_abc123' }) };
      }
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    const tokenResult = await adapter.tokenizeCard!(
      USER,
      { number: '4444444444444444', holderName: 'Teste', expMonth: '12', expYear: '2030', cvv: '123' },
      { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      '12345678909',
      '11999999999',
      '203.0.113.9'
    );

    expect(tokenResult).toBe('tok_abc123');
    const chamadaTokenize = chamadas.find((c) => c.url.includes('/tokenizeCreditCard'));
    const parsed = JSON.parse(chamadaTokenize!.body!);
    expect(parsed.customer).toBe('cus_tok');
    expect(parsed.remoteIp).toBe('203.0.113.9');
    expect(parsed.creditCard.number).toBe('4444444444444444');
  });

  it('createSubscription com gatewayToken: usa creditCardToken, nunca reenvia creditCard/creditCardHolderInfo', async () => {
    let bodySubscription = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_tok' }] }) };
      if (url.includes('/subscriptions')) {
        bodySubscription = init.body;
        return { ok: true, json: async () => ({ id: 'sub_tok' }) };
      }
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    const tokenPaymentData: PaymentData = { method: 'card', gatewayToken: 'tok_abc123', ip: '203.0.113.9' };
    const result = await adapter.createSubscription(PLAN, USER, tokenPaymentData, 'checkout_8');

    expect(result.gatewaySubscriptionId).toBe('sub_tok');
    expect(result.gatewayCustomerId).toBe('cus_tok');
    const parsed = JSON.parse(bodySubscription);
    expect(parsed.creditCardToken).toBe('tok_abc123');
    expect(parsed.creditCard).toBeUndefined();
    expect(parsed.creditCardHolderInfo).toBeUndefined();
    expect(parsed.remoteIp).toBe('203.0.113.9');
  });
});

describe('pagarmeAdapter.createSubscription — caminho com card_token', () => {
  // Diferente da Asaas, a tokenização da Pagar.me usa a public_key (nunca a
  // secret_key) e pode ser chamada direto do navegador — não precisa de rota
  // de proxy no nosso servidor. Este teste cobre só o lado do adapter: dado
  // um card_token já gerado no cliente, a assinatura é criada sem reenviar
  // os dados crus do cartão, mas o billing_address continua obrigatório (a
  // doc confirma que endereço não é tokenizado).
  it('usa card.card_token e mantém billing_address, sem enviar número/cvv em claro', async () => {
    let bodySubscription = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('/subscriptions')) {
        bodySubscription = init.body;
        return { ok: true, json: async () => ({ id: 'sub_pm_tok', customer: { id: 'cus_pm_tok' } }) };
      }
      throw new Error('URL inesperada: ' + url);
    }));

    const adapter = pagarmeAdapter('sk_test_fake');
    const tokenPaymentData: PaymentData = {
      method: 'card',
      gatewayToken: 'token_zVw7rqvHEPH8XlbE',
      billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      doc: '12345678909',
      phone: '11999999999',
    };
    const result = await adapter.createSubscription(PLAN, USER, tokenPaymentData, 'checkout_9');

    expect(result.gatewaySubscriptionId).toBe('sub_pm_tok');
    const parsed = JSON.parse(bodySubscription);
    expect(parsed.card.card_token).toBe('token_zVw7rqvHEPH8XlbE');
    expect(parsed.card.number).toBeUndefined();
    expect(parsed.card.cvv).toBeUndefined();
    expect(parsed.card.billing_address.city).toBe('São Paulo');
  });

  it('sem creditCard nem gatewayToken, rejeita antes de chamar a rede', async () => {
    const adapter = pagarmeAdapter('sk_test_fake');
    const semCartao: PaymentData = {
      method: 'card',
      billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      doc: '12345678909',
    };
    await expect(adapter.createSubscription(PLAN, USER, semCartao, 'checkout_10')).rejects.toThrow('cartão de crédito ou token');
  });
});
