import { describe, it, expect, vi, afterEach } from 'vitest';
import { pagarmeAdapter } from './pagarme';
import { dataBrasilISO, diaDoMesBrasil } from './data-brasil';
import type { GatewayUser, PaymentData } from './types';

// Hotfix: o Pagar.me recusa billing_day > 28 (422, confirmado no sandbox) e 'exact_day' só aceita mensal.
const USER: GatewayUser = { id: 'u1', email: 'u@teste.com', name: 'Teste' };
const pd: PaymentData = { method: 'card', gatewayToken: 'tok', billingAddress: { cep: '01310-100', street: 'Av', number: '1', neighborhood: 'B', city: 'SP', state: 'SP' }, doc: '12345678909', phone: '11999999999' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function criar(data: string, ciclo: 'monthly' | 'annual') {
  vi.useFakeTimers(); vi.setSystemTime(new Date(data));
  let corpo = '';
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: any) => { corpo = init.body; return { ok: true, json: async () => ({ id: 'sub_1', customer: { id: 'c' } }) } as any; }));
  await pagarmeAdapter('sk_test_x').createSubscription({ id: 'p', name: 'PRO', price: 79, billingCycle: ciclo }, USER, pd, 'chk');
  return JSON.parse(corpo);
}

describe('pagarme billing_day (hotfix)', () => {
  it('dia <= 28: exact_day com o dia de Brasília', async () => {
    const b = await criar('2026-10-13T15:00:00Z', 'monthly');
    expect([b.billing_type, b.billing_day]).toEqual(['exact_day', 13]);
  });
  it.each(['2026-10-29T15:00:00Z', '2026-10-30T15:00:00Z', '2026-10-31T15:00:00Z'])('dia 29-31 (%s): prepaid, sem billing_day', async (d) => {
    const b = await criar(d, 'monthly');
    expect(b.billing_type).toBe('prepaid');
    expect('billing_day' in b).toBe(false);
  });
  it('anual: sempre prepaid, interval year', async () => {
    const b = await criar('2026-10-13T15:00:00Z', 'annual');
    expect([b.billing_type, b.interval, 'billing_day' in b]).toEqual(['prepaid', 'year', false]);
  });
  it('usa o calendário de Brasília (UTC 01:30 do dia 29 ainda é dia 28 em BRT)', async () => {
    expect(diaDoMesBrasil(new Date('2026-10-29T01:30:00Z'))).toBe(28);
    expect(dataBrasilISO(new Date('2026-10-12T01:30:00Z'))).toBe('2026-10-11');
    const b = await criar('2026-10-29T01:30:00Z', 'monthly');
    expect(b.billing_type).toBe('exact_day');
  });
});
