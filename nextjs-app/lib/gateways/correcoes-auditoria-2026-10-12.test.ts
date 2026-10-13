import { describe, it, expect, vi, afterEach } from 'vitest';
import { pagarmeAdapter } from './pagarme';
import { asaasAdapter } from './asaas';
import { stripeAdapter } from './stripe';
import { dataBrasilISO, diaDoMesBrasil } from './data-brasil';
import type { GatewayPlan, GatewayUser, PaymentData } from './types';

// Regressões das correções da auditoria de 12/out/2026 (processo de desconto).
// Cada teste trava um comportamento que NENHUM teste anterior protegia:
// o valor em centavos enviado aos gateways (F18), o billing_day do Pagar.me
// (F14, confirmado ao vivo: a API recusa > 28), a data de Brasília (F14/F17),
// o updatePendingPayments do Asaas (F04) e a identidade do pagamento nos
// webhooks (F02/F03).

const USER: GatewayUser = { id: 'user_1', email: 'user@teste.com', name: 'Usuário Teste' };
const ENDERECO = { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('data-brasil — calendário de Brasília independente do fuso do servidor', () => {
  it('01:30 UTC do dia 12 ainda é dia 11 em Brasília (o servidor do Render roda em UTC)', () => {
    const d = new Date('2026-10-12T01:30:00Z');
    expect(dataBrasilISO(d)).toBe('2026-10-11');
    expect(diaDoMesBrasil(d)).toBe(11);
  });
  it('depois das 03:00 UTC já é o dia seguinte em Brasília', () => {
    expect(dataBrasilISO(new Date('2026-10-12T03:00:00Z'))).toBe('2026-10-12');
  });
  it('virada de mês: 31/out 23:30 BRT = 01/nov 02:30 UTC continua dia 31', () => {
    expect(diaDoMesBrasil(new Date('2026-11-01T02:30:00Z'))).toBe(31);
  });
});

describe('pagarmeAdapter.createSubscription — billing_day (F14) e valor em centavos (F18)', () => {
  const pd: PaymentData = { method: 'card', gatewayToken: 'token_x', billingAddress: ENDERECO, doc: '12345678909', phone: '11999999999' };

  async function criar(dataFalsa: string, plan: GatewayPlan) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(dataFalsa));
    let corpo = '';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: any) => {
      corpo = init.body;
      return { ok: true, json: async () => ({ id: 'sub_1', customer: { id: 'cus_1' } }) } as any;
    }));
    await pagarmeAdapter('sk_test_fake').createSubscription(plan, USER, pd, 'chk_1');
    return JSON.parse(corpo);
  }

  it('dia ≤ 28: exact_day com billing_day = dia de Brasília', async () => {
    const b = await criar('2026-10-13T15:00:00Z', { id: 'p', name: 'Produtor PRO', price: 39.5, billingCycle: 'monthly' });
    expect(b.billing_type).toBe('exact_day');
    expect(b.billing_day).toBe(13);
  });

  it.each(['2026-10-29T15:00:00Z', '2026-10-30T15:00:00Z', '2026-10-31T15:00:00Z'])(
    'dia 29-31 (%s): a API recusa billing_day > 28 (422), então usa prepaid e NÃO envia billing_day',
    async (dia) => {
      const b = await criar(dia, { id: 'p', name: 'Produtor PRO', price: 39.5, billingCycle: 'monthly' });
      expect(b.billing_type).toBe('prepaid');
      expect('billing_day' in b).toBe(false);
      expect(b.interval).toBe('month');
    },
  );

  it('30/out 22:30 em Brasília (= 31/out 01:30 UTC): decide pelo calendário de Brasília (dia 30), não pelo UTC', async () => {
    const b = await criar('2026-10-31T01:30:00Z', { id: 'p', name: 'Produtor PRO', price: 39.5, billingCycle: 'monthly' });
    expect(b.billing_type).toBe('prepaid'); // dia 30 > 28
  });

  it('28/out 22:30 em Brasília (= 29/out 01:30 UTC): ainda dia 28 -> exact_day, não 29', async () => {
    const b = await criar('2026-10-29T01:30:00Z', { id: 'p', name: 'Produtor PRO', price: 39.5, billingCycle: 'monthly' });
    expect(b.billing_type).toBe('exact_day');
    expect(b.billing_day).toBe(28);
  });

  it.each([
    [39.5, 'monthly', 3950],
    [74.5, 'monthly', 7450],
    [715.2, 'annual', 71520],
    [1430.4, 'annual', 143040],
    [379.2, 'annual', 37920],
  ] as const)('preço %s (%s) vai ao gateway como %s centavos (pricing_scheme.price)', async (preco, ciclo, centavos) => {
    const b = await criar('2026-10-13T15:00:00Z', { id: 'p', name: 'Plano', price: preco, billingCycle: ciclo });
    expect(b.items[0].pricing_scheme.price).toBe(centavos);
    expect(b.interval).toBe(ciclo === 'annual' ? 'year' : 'month');
  });
});

describe('pagarmeAdapter.updateSubscriptionPlan — valor enviado no reajuste (F18)', () => {
  it('reajuste do PRO mensal envia 7900 centavos e do Premium anual 143040, mantendo o item ativo', async () => {
    const puts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (String(url).includes('/items/')) { puts.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) } as any; }
      return { ok: true, json: async () => ({ items: [{ id: 'item_9' }], next_billing_at: '2026-11-13T00:00:00Z' }) } as any;
    }));
    const a = pagarmeAdapter('sk_test_fake');
    await a.updateSubscriptionPlan!('sub_1', { id: 'PRO', name: 'Produtor PRO', price: 79, billingCycle: 'monthly' }, false, 'n1');
    await a.updateSubscriptionPlan!('sub_2', { id: 'PREM', name: 'Premium', price: 1430.4, billingCycle: 'annual' }, false, 'n2');
    expect(puts[0].url).toContain('/subscriptions/sub_1/items/item_9');
    expect(puts[0].body.pricing_scheme.price).toBe(7900);
    expect(puts[0].body.status).toBe('active');
    expect(puts[1].body.pricing_scheme.price).toBe(143040);
  });
});

describe('asaasAdapter (F04, F17)', () => {
  const pd: PaymentData = {
    method: 'card',
    creditCard: { number: '4111111111111111', holderName: 'Teste', expMonth: '12', expYear: '2030', cvv: '123' },
    billingAddress: ENDERECO, doc: '12345678909', phone: '11999999999', ip: '203.0.113.9',
  };

  it('nextDueDate usa a data de BRASÍLIA: 12/out 01:30 UTC = 11/out 22:30 BRT -> 2026-10-11', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T01:30:00Z'));
    let corpo = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('/customers?externalReference=')) return { ok: true, json: async () => ({ data: [{ id: 'cus_1' }] }) } as any;
      if (url.includes('/subscriptions?')) return { ok: true, json: async () => ({ data: [] }) } as any;
      if (url.includes('/subscriptions')) { corpo = init.body; return { ok: true, json: async () => ({ id: 'sub_a' }) } as any; }
      throw new Error('URL inesperada: ' + url);
    }));
    await asaasAdapter('ak_test', 'sandbox').createSubscription({ id: 'p', name: 'Premium', price: 74.5, billingCycle: 'monthly' }, USER, pd, 'chk_a');
    const b = JSON.parse(corpo);
    expect(b.nextDueDate).toBe('2026-10-11');
    expect(b.value).toBe(74.5);
    expect(b.cycle).toBe('MONTHLY');
  });

  it('PUT do reajuste/downgrade envia updatePendingPayments:true e o valor cheio', async () => {
    let put: any = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if ((init?.method || 'GET') === 'PUT') { put = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ id: 'sub_a', nextDueDate: '2026-11-13' }) } as any; }
      return { ok: true, json: async () => ({ data: [] }) } as any;
    }));
    await asaasAdapter('ak_test', 'sandbox').updateSubscriptionPlan!('sub_a', { id: 'p', name: 'Premium', price: 149, billingCycle: 'monthly' }, false, 'n');
    expect(put.url).toContain('/subscriptions/sub_a');
    expect(put.body.updatePendingPayments).toBe(true);
    expect(put.body.value).toBe(149);
    expect(put.body.cycle).toBe('MONTHLY');
  });
});

describe('stripeAdapter — valor enviado (F18)', () => {
  it('assinatura USD com promo: 7.50 -> 750 centavos, usd, month; anual 139.20 -> 13920, year', async () => {
    const corpos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('/v1/customers')) return { ok: true, json: async () => ({ id: 'cus' }) } as any;
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod' }) } as any;
      if (url.includes('/v1/subscriptions')) { corpos.push(init.body); return { ok: true, json: async () => ({ id: 'sub', status: 'active' }) } as any; }
      throw new Error('URL inesperada: ' + url);
    }));
    const a = stripeAdapter('sk_test_fake');
    const pd: PaymentData = { method: 'card', gatewayToken: 'pm_x' };
    await a.createSubscription({ id: 'p', name: 'PRO', price: 7.5, billingCycle: 'monthly', currency: 'USD' }, USER, pd, 'c1');
    await a.createSubscription({ id: 'p', name: 'Premium', price: 139.2, billingCycle: 'annual', currency: 'USD' }, USER, pd, 'c2');
    const p1 = new URLSearchParams(corpos[0]), p2 = new URLSearchParams(corpos[1]);
    expect([p1.get('items[0][price_data][unit_amount]'), p1.get('items[0][price_data][currency]'), p1.get('items[0][price_data][recurring][interval]')]).toEqual(['750', 'usd', 'month']);
    expect([p2.get('items[0][price_data][unit_amount]'), p2.get('items[0][price_data][recurring][interval]')]).toEqual(['13920', 'year']);
  });

  it('reajuste ao preço cheio: 15 USD -> 1500 centavos, proration_behavior=none, sem payment_behavior', async () => {
    let upd = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (url.includes('/v1/products')) return { ok: true, json: async () => ({ id: 'prod' }) } as any;
      if ((init?.method || 'GET') === 'POST' && url.includes('/v1/subscriptions/')) { upd = init.body; return { ok: true, json: async () => ({ id: 'sub', items: { data: [{ current_period_end: 1790000000 }] } }) } as any; }
      return { ok: true, json: async () => ({ id: 'sub', items: { data: [{ id: 'si_1' }] } }) } as any;
    }));
    await stripeAdapter('sk_test_fake').updateSubscriptionPlan!('sub', { id: 'p', name: 'PRO', price: 15, billingCycle: 'monthly', currency: 'USD' }, false, 'promo-reajuste:x');
    const p = new URLSearchParams(upd);
    expect(p.get('items[0][price_data][unit_amount]')).toBe('1500');
    expect(p.get('proration_behavior')).toBe('none');
    expect(p.get('payment_behavior')).toBeNull();
  });
});

describe('paymentId nos webhooks — um pagamento, vários eventos (F02/F03)', () => {
  it('Pagar.me: invoice.paid e charge.paid da MESMA fatura têm o mesmo paymentId', async () => {
    const seg = 'usuario:senha';
    const auth = { authorization: 'Basic ' + Buffer.from(seg).toString('base64') };
    const a = pagarmeAdapter('sk_test_fake');
    const subscription = { id: 'sub_9', customer: { id: 'cus_9' }, metadata: { subscription_id: 'abc' } };
    const invoicePaid = JSON.stringify({ id: 'hook_1', type: 'invoice.paid', data: { id: 'in_777', subscription } });
    const chargePaid = JSON.stringify({ id: 'hook_2', type: 'charge.paid', data: { id: 'ch_555', invoice: { id: 'in_777', subscription }, subscription } });
    const e1 = await a.validateWebhook(invoicePaid, auth, seg);
    const e2 = await a.validateWebhook(chargePaid, auth, seg);
    expect(e1.eventId).not.toBe(e2.eventId);
    expect(e1.paymentId).toBe('in_777');
    expect(e2.paymentId).toBe('in_777');
  });

  it('Asaas: PAYMENT_CONFIRMED e PAYMENT_RECEIVED da mesma cobrança têm o mesmo paymentId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'CONFIRMED' }) } as any)));
    const a = asaasAdapter('ak_test', 'sandbox');
    const mk = (evento: string, id: string) => JSON.stringify({ id, event: evento, payment: { id: 'pay_1', subscription: 'sub_a', customer: 'cus_1' } });
    const e1 = await a.validateWebhook(mk('PAYMENT_CONFIRMED', 'evt_1'), { 'asaas-access-token': 'tok' }, 'tok');
    const e2 = await a.validateWebhook(mk('PAYMENT_RECEIVED', 'evt_2'), { 'asaas-access-token': 'tok' }, 'tok');
    expect(e1.paymentId).toBe('pay_1');
    expect(e2.paymentId).toBe('pay_1');
    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

describe('recusadoPeloGateway (F46)', () => {
  it.each([400, 402, 412, 422])('HTTP %s é recusa definitiva (o gateway respondeu e rejeitou)', async (status) => {
    const { recusadoPeloGateway } = await import('./types');
    expect(recusadoPeloGateway(status)).toBe(true);
  });
  it.each([401, 403, 404, 408, 409, 429, 500, 502, 503])('HTTP %s NÃO é recusa de cartão (credencial/infra/ambíguo)', async (status) => {
    const { recusadoPeloGateway } = await import('./types');
    expect(recusadoPeloGateway(status)).toBe(false);
  });
});

describe('stripeAdapter.validateWebhook — rotação de segredo (F85)', () => {
  async function evento(sigHeaderDe: (t: string, bom: string) => string) {
    const crypto = await import('crypto');
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.payment_succeeded', created: 1, data: { object: { id: 'in_1', billing_reason: 'subscription_cycle', subscription: 'sub_1', customer: 'cus_1' } } });
    const t = String(Math.floor(Date.now() / 1000));
    const bom = crypto.createHmac('sha256', 'whsec_novo').update(`${t}.${body}`).digest('hex');
    return stripeAdapter('sk_test_x').validateWebhook(body, { 'stripe-signature': sigHeaderDe(t, bom) }, 'whsec_novo');
  }
  it('aceita quando a assinatura boa NÃO é a última v1 do cabeçalho (segredo antigo + novo ativos)', async () => {
    const e = await evento((t, bom) => `t=${t},v1=${bom},v1=${'0'.repeat(64)}`);
    expect(e.type).toBe('subscription.renewed');
  });
  it('rejeita quando nenhuma v1 confere', async () => {
    await expect(evento((t) => `t=${t},v1=${'0'.repeat(64)},v1=${'1'.repeat(64)}`)).rejects.toThrow('Invalid Stripe signature');
  });
});
