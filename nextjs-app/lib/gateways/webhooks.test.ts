import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { stripeAdapter } from './stripe';
import { mercadoPagoAdapter } from './mercadopago';
import { pagarmeAdapter } from './pagarme';
import { asaasAdapter } from './asaas';

// Testes de auto-consistência: provam que cada validateWebhook aceita uma
// requisição assinada exatamente como o próprio esquema do adapter descreve,
// rejeita adulteração/replay, e nunca deixa passar sem secret configurado.
// Isto NÃO prova que o esquema bate com o que Stripe/MP/Pagar.me/Asaas
// realmente enviam em produção — essa comparação é feita à parte, contra a
// documentação oficial de cada um.

const SECRET = 'segredo-de-teste-nao-real';

describe('stripeAdapter.validateWebhook', () => {
  const adapter = stripeAdapter('sk_test_fake');

  function assinar(body: string, secret: string, tsOverride?: number) {
    const t = tsOverride ?? Math.floor(Date.now() / 1000);
    const payload = `${t}.${body}`;
    const v1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return { header: `t=${t},v1=${v1}`, t };
  }

  it('rejeita sem header stripe-signature', async () => {
    await expect(adapter.validateWebhook('{}', {}, SECRET)).rejects.toThrow('Missing Stripe signature');
  });

  it('rejeita sem secret configurado, mesmo com header presente', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const { header } = assinar(body, SECRET);
    await expect(adapter.validateWebhook(body, { 'stripe-signature': header }, '')).rejects.toThrow('secret not configured');
  });

  it('rejeita timestamp fora da janela de 5 minutos (replay)', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const dezMinAtras = Math.floor(Date.now() / 1000) - 600;
    const { header } = assinar(body, SECRET, dezMinAtras);
    await expect(adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET)).rejects.toThrow('replay');
  });

  it('rejeita body adulterado após assinado', async () => {
    const bodyOriginal = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });
    const { header } = assinar(bodyOriginal, SECRET);
    const bodyAdulterado = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { subscription: 'sub_forjado' } } });
    await expect(adapter.validateWebhook(bodyAdulterado, { 'stripe-signature': header }, SECRET)).rejects.toThrow('Invalid Stripe signature');
  });

  it('aceita checkout.session.completed corretamente assinado -> subscription.activated', async () => {
    const body = JSON.stringify({
      id: 'evt_1', type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_123', customer: 'cus_123', client_reference_id: 'ref_1' } },
    });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.activated');
    expect(evt.gatewaySubscriptionId).toBe('sub_123');
    expect(evt.gatewayCustomerId).toBe('cus_123');
  });

  it('invoice.payment_succeeded com billing_reason=subscription_create -> activated', async () => {
    const body = JSON.stringify({
      id: 'evt_2', type: 'invoice.payment_succeeded',
      data: { object: { billing_reason: 'subscription_create', subscription: 'sub_123' } },
    });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.activated');
  });

  it('invoice.payment_succeeded com billing_reason=subscription_cycle -> renewed', async () => {
    const body = JSON.stringify({
      id: 'evt_3', type: 'invoice.payment_succeeded',
      data: { object: { billing_reason: 'subscription_cycle', subscription: 'sub_123' } },
    });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.renewed');
  });

  it('customer.subscription.deleted -> cancelled', async () => {
    const body = JSON.stringify({ id: 'evt_4', type: 'customer.subscription.deleted', data: { object: { id: 'sub_123' } } });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.cancelled');
    expect(evt.gatewaySubscriptionId).toBe('sub_123');
  });

  it('invoice.payment_failed -> payment.failed', async () => {
    const body = JSON.stringify({ id: 'evt_5', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_123' } } });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('payment.failed');
  });

  it('evento não mapeado -> unknown, sem lançar', async () => {
    const body = JSON.stringify({ id: 'evt_6', type: 'customer.created', data: { object: {} } });
    const { header } = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'stripe-signature': header }, SECRET);
    expect(evt.type).toBe('unknown');
  });
});

describe('pagarmeAdapter.validateWebhook', () => {
  const adapter = pagarmeAdapter('ak_test_fake');

  function assinar(body: string, secret: string) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  it('rejeita sem header x-hub-signature', async () => {
    await expect(adapter.validateWebhook('{}', {}, SECRET)).rejects.toThrow('Missing Pagar.me signature');
  });

  it('rejeita sem secret configurado', async () => {
    const body = '{}';
    await expect(adapter.validateWebhook(body, { 'x-hub-signature': assinar(body, SECRET) }, '')).rejects.toThrow('secret not configured');
  });

  it('rejeita body adulterado', async () => {
    const bodyOriginal = JSON.stringify({ id: 'evt_1', type: 'charge.paid', data: { subscription_id: 'sub_1' } });
    const header = assinar(bodyOriginal, SECRET);
    const bodyAdulterado = JSON.stringify({ id: 'evt_1', type: 'charge.paid', data: { subscription_id: 'sub_forjado' } });
    await expect(adapter.validateWebhook(bodyAdulterado, { 'x-hub-signature': header }, SECRET)).rejects.toThrow('Invalid Pagar.me signature');
  });

  it('charge.paid com subscription_id -> subscription.activated', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'charge.paid', data: { subscription_id: 'sub_1', customer: { id: 'cus_1', email: 'a@a.com' } } });
    const header = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'x-hub-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.activated');
  });

  it('charge.paid SEM subscription_id -> unknown (cobrança avulsa, não é de assinatura)', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'charge.paid', data: { customer: { id: 'cus_1' } } });
    const header = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'x-hub-signature': header }, SECRET);
    expect(evt.type).toBe('unknown');
  });

  it('subscription.canceled (uma L) -> subscription.cancelled', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'subscription.canceled', data: {} });
    const header = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'x-hub-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.cancelled');
  });

  it('charge.payment_failed com subscription -> payment.failed', async () => {
    const body = JSON.stringify({ id: 'evt_3', type: 'charge.payment_failed', data: { subscription: { id: 'sub_1' } } });
    const header = assinar(body, SECRET);
    const evt = await adapter.validateWebhook(body, { 'x-hub-signature': header }, SECRET);
    expect(evt.type).toBe('payment.failed');
  });
});

describe('asaasAdapter.validateWebhook', () => {
  const adapter = asaasAdapter('ak_test_fake', 'sandbox');

  it('rejeita sem secret configurado', async () => {
    await expect(adapter.validateWebhook('{}', { 'asaas-access-token': SECRET }, '')).rejects.toThrow('token not configured');
  });

  it('rejeita token ausente', async () => {
    await expect(adapter.validateWebhook('{}', {}, SECRET)).rejects.toThrow('Invalid Asaas access token');
  });

  it('rejeita token que não bate — prova que o timing-safe compare funciona nos dois sentidos', async () => {
    await expect(adapter.validateWebhook('{}', { 'asaas-access-token': 'token-errado' }, SECRET)).rejects.toThrow('Invalid Asaas access token');
  });

  it('aceita token correto: PAYMENT_RECEIVED com subscription -> activated', async () => {
    const body = JSON.stringify({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1', customer: 'cus_1' } });
    const evt = await adapter.validateWebhook(body, { 'asaas-access-token': SECRET }, SECRET);
    expect(evt.type).toBe('subscription.activated');
  });

  it('PAYMENT_OVERDUE com subscription -> payment.failed', async () => {
    const body = JSON.stringify({ id: 'evt_2', event: 'PAYMENT_OVERDUE', payment: { subscription: 'sub_1' } });
    const evt = await adapter.validateWebhook(body, { 'asaas-access-token': SECRET }, SECRET);
    expect(evt.type).toBe('payment.failed');
  });

  it('SUBSCRIPTION_DELETED -> subscription.cancelled', async () => {
    const body = JSON.stringify({ id: 'evt_3', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_1' } });
    const evt = await adapter.validateWebhook(body, { 'asaas-access-token': SECRET }, SECRET);
    expect(evt.type).toBe('subscription.cancelled');
  });
});

describe('mercadoPagoAdapter.validateWebhook — parte sem chamada de rede', () => {
  const adapter = mercadoPagoAdapter('at_test_fake');

  function assinar(dataId: string, ts: string, secret: string) {
    const payloadToSign = `id:${dataId};request-date:${ts};`;
    const v1 = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
    return `ts=${ts},v1=${v1}`;
  }

  it('HIPÓTESE TESTADA: sem header E sem secret, ainda assim rejeita (o warn "modo teste" não é um bypass de verdade)', async () => {
    // O código tem um bloco que só faz console.warn quando faltam header e
    // secret ao mesmo tempo, sem lançar erro naquele ponto — parecendo um
    // bypass de "modo desenvolvimento". Mas duas linhas depois há um segundo
    // `if (!secret) throw` incondicional, que pega esse mesmo caso. Este
    // teste prova que a requisição É rejeitada de ponta a ponta, e não passa
    // batido como o comentário do console.warn poderia sugerir.
    const body = JSON.stringify({ data: { id: 'x1' } });
    await expect(adapter.validateWebhook(body, {}, '')).rejects.toThrow('secret not configured');
  });

  it('sem header MAS com secret configurado -> rejeita por header ausente', async () => {
    const body = JSON.stringify({ data: { id: 'x1' } });
    await expect(adapter.validateWebhook(body, {}, SECRET)).rejects.toThrow('Missing MP x-signature header');
  });

  it('sem data.id no corpo -> rejeita', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('x1', ts, SECRET);
    await expect(adapter.validateWebhook('{}', { 'x-signature': header }, SECRET)).rejects.toThrow('Missing data.id');
  });

  it('timestamp fora da janela -> rejeita (replay)', async () => {
    const tsAntigo = String(Math.floor(Date.now() / 1000) - 600);
    const header = assinar('x1', tsAntigo, SECRET);
    const body = JSON.stringify({ data: { id: 'x1' } });
    await expect(adapter.validateWebhook(body, { 'x-signature': header }, SECRET)).rejects.toThrow('replay');
  });

  it('assinatura adulterada -> rejeita', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('id-diferente', ts, SECRET);
    const body = JSON.stringify({ data: { id: 'x1' } });
    await expect(adapter.validateWebhook(body, { 'x-signature': header }, SECRET)).rejects.toThrow('Invalid MP signature');
  });
});

describe('mercadoPagoAdapter.validateWebhook — com fetch mockado (enriquecimento via API)', () => {
  const adapter = mercadoPagoAdapter('at_test_fake');

  function assinar(dataId: string, ts: string, secret: string) {
    const payloadToSign = `id:${dataId};request-date:${ts};`;
    const v1 = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
    return `ts=${ts},v1=${v1}`;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subscription_preapproval com status authorized -> subscription.activated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'authorized', external_reference: 'ref_1', payer_email: 'a@a.com' }),
    })));
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('preap_1', ts, SECRET);
    const body = JSON.stringify({ id: 999, action: 'subscription_preapproval', data: { id: 'preap_1' } });
    const evt = await adapter.validateWebhook(body, { 'x-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.activated');
    expect(evt.externalReference).toBe('ref_1');
  });

  it('subscription_preapproval com status cancelled -> subscription.cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'cancelled' }) })));
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('preap_2', ts, SECRET);
    const body = JSON.stringify({ id: 998, action: 'subscription_preapproval', data: { id: 'preap_2' } });
    const evt = await adapter.validateWebhook(body, { 'x-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.cancelled');
  });

  it('payment aprovado -> subscription.renewed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'approved', external_reference: 'ref_2', payer: { email: 'a@a.com' } }),
    })));
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('pay_1', ts, SECRET);
    const body = JSON.stringify({ id: 997, type: 'payment', data: { id: 'pay_1' } });
    const evt = await adapter.validateWebhook(body, { 'x-signature': header }, SECRET);
    expect(evt.type).toBe('subscription.renewed');
  });

  it('payment rejeitado -> payment.failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'rejected' }) })));
    const ts = String(Math.floor(Date.now() / 1000));
    const header = assinar('pay_2', ts, SECRET);
    const body = JSON.stringify({ id: 996, type: 'payment', data: { id: 'pay_2' } });
    const evt = await adapter.validateWebhook(body, { 'x-signature': header }, SECRET);
    expect(evt.type).toBe('payment.failed');
  });
});
