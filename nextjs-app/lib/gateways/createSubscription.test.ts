import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripeAdapter } from './stripe';
import { asaasAdapter } from './asaas';
import { pagarmeAdapter } from './pagarme';
import { GatewayDeclinedError } from './types';
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
  vi.useRealTimers();
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

describe('stripeAdapter.createSubscription — 1ª cobrança não confirmada', () => {
  // Achado ao vivo (03/out/2026): sem payment_behavior o padrão da Stripe é
  // allow_incomplete -- cartão recusado na 1ª fatura (ou com 3DS) devolvia
  // HTTP 200 e uma assinatura 'incomplete', que o checkout tratava como sucesso.
  const pagamento = { method: 'card', gatewayToken: 'pm_123' } as PaymentData;

  it('envia payment_behavior=error_if_incomplete na criação da assinatura', async () => {
    let corpoSub = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus_1' }) };
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      corpoSub = init.body;
      return { ok: true, json: async () => ({ id: 'sub_1', status: 'active' }) };
    }));
    await stripeAdapter('sk_test_x').createSubscription(PLAN, USER, pagamento, 'chk_1');
    expect(new URLSearchParams(corpoSub).get('payment_behavior')).toBe('error_if_incomplete');
  });

  // Revisão adversarial (03/out/2026): a chave NÃO pode depender do cartão.
  // Com chave por cartão, um retry ambíguo (timeout) trocando o PaymentMethod
  // criaria uma 2ª assinatura/cobrança na Stripe. A chave é estável por
  // checkoutId (mesmo retry => mesma chave => deduplica); depois de uma
  // RECUSA o cliente rotaciona o checkoutId (HTTP 402), então outro cartão
  // chega com id — e portanto chave — novos.
  it('Idempotency-Key do Customer e da Subscription é estável por checkoutId, independente do cartão', async () => {
    const chaves: Record<string, string[]> = { cust: [], sub: [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (url.includes('/v1/customers')) { chaves.cust.push(init.headers['Idempotency-Key']); return { ok: true, json: async () => ({ id: 'cus_1' }) }; }
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      chaves.sub.push(init.headers['Idempotency-Key']);
      return { ok: true, json: async () => ({ id: 'sub_1', status: 'active' }) };
    }));
    const a = stripeAdapter('sk_test_x');
    await a.createSubscription(PLAN, USER, { method: 'card', gatewayToken: 'pm_A' } as PaymentData, 'chk_same');
    await a.createSubscription(PLAN, USER, { method: 'card', gatewayToken: 'pm_B' } as PaymentData, 'chk_same');
    await a.createSubscription(PLAN, USER, { method: 'card', gatewayToken: 'pm_A' } as PaymentData, 'chk_outro');
    for (const k of [chaves.cust, chaves.sub]) { expect(k[0]).toBe(k[1]); expect(k[2]).not.toBe(k[0]); }
    expect(chaves.sub[0]).toBe('stripe_sub_chk_same');
    expect(chaves.cust[0]).toBe('stripe_cust_chk_same');
  });

  it('assinatura devolvida como incomplete vira erro TIPADO (declined) e é cancelada (nunca sucesso)', async () => {
    const chamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      chamadas.push((init?.method || 'GET') + ' ' + url);
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus_1' }) };
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: 'sub_inc', status: 'incomplete' }) };
    }));
    const erro: any = await stripeAdapter('sk_test_x').createSubscription(PLAN, USER, pagamento, 'chk_2').catch((e) => e);
    expect(erro).toBeInstanceOf(GatewayDeclinedError);
    expect(erro.declined).toBe(true);
    expect(erro.message).toContain('primeira cobrança não confirmada');
    expect(chamadas.some(c => c.startsWith('DELETE') && c.endsWith('/v1/subscriptions/sub_inc'))).toBe(true);
  });

  it('4xx da Stripe na criação da assinatura (cartão recusado) vira GatewayDeclinedError; 5xx NÃO', async () => {
    const stub = (status: number) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus_1' }) };
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      return { ok: false, status, text: async () => 'card_declined' };
    }));
    stub(402);
    const recusa: any = await stripeAdapter('sk_test_x').createSubscription(PLAN, USER, pagamento, 'chk_3').catch((e) => e);
    expect(recusa).toBeInstanceOf(GatewayDeclinedError);
    stub(503);
    const indisponivel: any = await stripeAdapter('sk_test_x').createSubscription(PLAN, USER, pagamento, 'chk_4').catch((e) => e);
    expect(indisponivel).not.toBeInstanceOf(GatewayDeclinedError);
  });
});

describe('stripeAdapter.updateSubscriptionPlan — troca com proração', () => {
  // Revisão adversarial (03/out/2026): upgrade com proração sem payment_behavior
  // aplicava o novo plano mesmo com a fatura proporcional recusada (o usuário
  // ganhava o plano de graça). error_if_incomplete faz a Stripe rejeitar a
  // troca inteira. Sem proração (downgrade) não há cobrança imediata a falhar.
  const stubUpdate = () => {
    const corpos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      if (init?.method === 'POST' && url.includes('/v1/subscriptions/sub_old')) {
        corpos.push(init.body);
        return { ok: true, json: async () => ({ id: 'sub_old', status: 'active' }) };
      }
      return { ok: true, json: async () => ({ id: 'sub_old', items: { data: [{ id: 'si_1' }] }, status: 'active' }) };
    }));
    return corpos;
  };

  it('com proração envia payment_behavior=error_if_incomplete', async () => {
    const corpos = stubUpdate();
    await stripeAdapter('sk_test_x').updateSubscriptionPlan!('sub_old', PLAN, true, 'chk_up');
    expect(corpos.length).toBeGreaterThan(0);
    expect(new URLSearchParams(corpos[corpos.length - 1]).get('payment_behavior')).toBe('error_if_incomplete');
  });

  it('proração recusada (4xx) vira GatewayDeclinedError; falha de servidor (5xx) NÃO', async () => {
    const stubFalha = (status: number) => vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_1' }) };
      if (init?.method === 'POST' && url.includes('/v1/subscriptions/sub_old')) return { ok: false, status, text: async () => 'card_declined' };
      return { ok: true, json: async () => ({ id: 'sub_old', items: { data: [{ id: 'si_1' }] }, status: 'active' }) };
    }));
    stubFalha(402);
    const recusa: any = await stripeAdapter('sk_test_x').updateSubscriptionPlan!('sub_old', PLAN, true, 'chk_d').catch((e) => e);
    expect(recusa).toBeInstanceOf(GatewayDeclinedError);
    stubFalha(503);
    const indisponivel: any = await stripeAdapter('sk_test_x').updateSubscriptionPlan!('sub_old', PLAN, true, 'chk_e').catch((e) => e);
    expect(indisponivel).not.toBeInstanceOf(GatewayDeclinedError);
  });

  it('sem proração (downgrade) NÃO envia payment_behavior', async () => {
    const corpos = stubUpdate();
    await stripeAdapter('sk_test_x').updateSubscriptionPlan!('sub_old', PLAN, false, 'chk_down');
    expect(corpos.length).toBeGreaterThan(0);
    expect(new URLSearchParams(corpos[corpos.length - 1]).get('payment_behavior')).toBeNull();
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
      if (url.includes('/customers?externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_1' }] }) };
      // Busca de idempotência (assinatura já existente?) — vazia, força seguir pro POST real.
      if (url.includes('/subscriptions?')) return { ok: true, json: async () => ({ data: [] }) };
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

  // Regressão do achado de auditoria (2026-09-25): sem esta busca, uma
  // resposta perdida DEPOIS da Asaas já ter cobrado o cartão fazia um retry
  // criar uma SEGUNDA assinatura real. Mesmo padrão de proteção já testado
  // acima para findOrCreateCustomer, agora para a assinatura em si.
  it('reaproveita assinatura existente por externalReference em vez de criar outra (proteção de idempotência)', async () => {
    const metodos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      metodos.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('/customers?externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_1' }] }) };
      if (url.includes('/subscriptions?')) return { ok: true, json: async () => ({ data: [{ id: 'sub_existente' }] }) };
      throw new Error('Não deveria criar uma nova assinatura quando a busca já encontrou uma: ' + url);
    }));

    const adapter = asaasAdapter('ak_test', 'sandbox');
    const result = await adapter.createSubscription(PLAN, USER, paymentData, 'checkout_idempotencia');

    expect(result.gatewaySubscriptionId).toBe('sub_existente');
    expect(metodos.some((m) => m.startsWith('POST') && m.includes('/subscriptions'))).toBe(false);
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
      if (url.includes('/customers?externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_tok' }] }) };
      // Busca de idempotência (assinatura já existente?) — vazia, força seguir pro POST real.
      if (url.includes('/subscriptions?')) return { ok: true, json: async () => ({ data: [] }) };
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
    // BUG CORRIGIDO (achado ao vivo contra o sandbox real, 2026-09-02): o
    // teste antigo esperava card_token ANINHADO dentro de `card` — exatamente
    // o formato que a API da Pagar.me ignora em silêncio (tenta validar
    // `card` como se fossem dados crus e rejeita com 422 "número do cartão
    // obrigatório"). card_token precisa ir solto na raiz do corpo da
    // assinatura; `card` continua existindo só pra carregar billing_address.
    expect(parsed.card_token).toBe('token_zVw7rqvHEPH8XlbE');
    expect(parsed.card.card_token).toBeUndefined();
    expect(parsed.card.number).toBeUndefined();
    expect(parsed.card.cvv).toBeUndefined();
    expect(parsed.card.billing_address.city).toBe('São Paulo');
    // Achado de verificação contra a doc oficial: document_type aparece
    // pareado com document em todo exemplo funcional da doc — faltava.
    expect(parsed.customer.document_type).toBe('CPF');
  });

  // Achado ao vivo no sandbox (2026-10-03): billing_type 'exact_day' só aceita
  // interval 'month'; assinatura anual precisa de 'prepaid' e não aceita
  // billing_day. O mensal continua em 'exact_day' + billing_day (validado).
  it.each([
    ['monthly', 'month', 'exact_day', true],
    ['annual', 'year', 'prepaid', false],
  ] as const)('ciclo %s usa interval=%s com billing_type=%s', async (billingCycle, interval, billingType, temBillingDay) => {
    // Data FIXA (dia 13): o adapter usa o dia do mês de Brasília como billing_day
    // e troca para 'prepaid' nos dias 29-31 (F14) -- sem fixar o relógio este
    // teste mudaria de resultado conforme o dia em que roda.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T15:00:00Z'));
    let bodySubscription = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      bodySubscription = init.body;
      return { ok: true, json: async () => ({ id: 'sub_pm_cycle', customer: { id: 'cus_pm_cycle' } }) };
    }));
    const adapter = pagarmeAdapter('sk_test_fake');
    await adapter.createSubscription(
      { ...PLAN, billingCycle },
      USER,
      {
        method: 'card',
        gatewayToken: 'token_ciclo',
        billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
        doc: '12345678909',
        phone: '11999999999',
      },
      'checkout_cycle'
    );
    const parsed = JSON.parse(bodySubscription);
    expect(parsed.interval).toBe(interval);
    expect(parsed.billing_type).toBe(billingType);
    expect('billing_day' in parsed).toBe(temBillingDay);
  });

  // Achado ao vivo no sandbox (2026-10-03): 1ª cobrança recusada = HTTP 200 +
  // status 'failed'. Antes o adapter devolvia sucesso.
  it('1ª cobrança recusada (HTTP 200 + status failed) vira erro e cancela a assinatura morta', async () => {
    const chamadas: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      chamadas.push({ url, method: init?.method });
      if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: 'sub_falhou', status: 'failed', customer: { id: 'cus_x' } }) };
    }));
    const adapter = pagarmeAdapter('sk_test_fake');
    await expect(adapter.createSubscription(
      PLAN, USER,
      {
        method: 'card',
        gatewayToken: 'token_recusado',
        billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
        doc: '12345678909',
        phone: '11999999999',
      },
      'checkout_failed'
    )).rejects.toBeInstanceOf(GatewayDeclinedError);
    expect(chamadas.some(c => c.method === 'DELETE' && c.url.endsWith('/subscriptions/sub_falhou'))).toBe(true);
  });

  it('HTTP 4xx do Pagar.me vira GatewayDeclinedError; 5xx continua erro comum (ambíguo, não rotaciona checkoutId)', async () => {
    const pagamento: PaymentData = {
      method: 'card',
      gatewayToken: 'token_x',
      billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      doc: '12345678909',
      phone: '11999999999',
    };
    const stub = (status: number) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, text: async () => 'erro' })));
    stub(422);
    const recusa: any = await pagarmeAdapter('sk_test_fake').createSubscription(PLAN, USER, pagamento, 'chk_422').catch((e) => e);
    expect(recusa).toBeInstanceOf(GatewayDeclinedError);
    expect(recusa.declined).toBe(true);
    stub(502);
    const indisponivel: any = await pagarmeAdapter('sk_test_fake').createSubscription(PLAN, USER, pagamento, 'chk_502').catch((e) => e);
    expect(indisponivel).not.toBeInstanceOf(GatewayDeclinedError);
  });

  // Revisão adversarial (03/out/2026): a chave por cartão (token) criava uma 2ª
  // assinatura num retry ambíguo com outro cartão. A chave agora é estável por
  // checkoutId; o cliente rotaciona o checkoutId depois de uma recusa (402).
  it('Idempotency-Key é estável por checkoutId, independente do token do cartão', async () => {
    const chaves: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      chaves.push(init.headers['Idempotency-Key']);
      return { ok: true, json: async () => ({ id: 'sub_x', status: 'active', customer: { id: 'cus_x' } }) };
    }));
    const adapter = pagarmeAdapter('sk_test_fake');
    const pagamento = (gatewayToken: string): PaymentData => ({
      method: 'card',
      gatewayToken,
      billingAddress: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      doc: '12345678909',
      phone: '11999999999',
    });
    await adapter.createSubscription(PLAN, USER, pagamento('token_cartao_A'), 'checkout_same');
    await adapter.createSubscription(PLAN, USER, pagamento('token_cartao_B'), 'checkout_same');
    await adapter.createSubscription(PLAN, USER, pagamento('token_cartao_A'), 'checkout_novo');
    expect(chaves[0]).toBe(chaves[1]);
    expect(chaves[2]).not.toBe(chaves[0]);
    expect(chaves[0]).toBe('pagarme-sub-checkout_same');
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
