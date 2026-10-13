import { describe, it, expect, vi, beforeEach } from 'vitest';

// F02 (auditoria 12/out/2026) no HANDLER real: eventos DIFERENTES (event ids
// distintos) que descrevem o MESMO pagamento não podem estender o período de novo.
// Reproduzido ao vivo antes da correção: 1 pagamento = 31 -> 61 -> 92 dias de acesso.
// Antes não existia nenhum teste de processPaymentWebhook (770 linhas).

const estado = {
  eventos: new Set<string>(),
  escritas: [] as Array<{ tabela: string; op: string; dados?: any }>,
  sub: { id: 'sub-local-1', user_id: 'u1', status: 'active', plan: 'Produtor PRO', gateway: 'pagarme', gateway_subscription_id: 'sub_gw_1', billing_cycle: 'monthly', cancel_at_period_end: false, created_at: '2026-10-01T00:00:00Z', promo_first_cycle_pending: false, current_period_end: '2026-11-01T00:00:00Z' } as any,
};

function criarSupabase() {
  const from = (tabela: string) => {
    const filtros: Record<string, any> = {};
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => ((filtros[c] = v), q),
      neq: () => q, gt: () => q, lt: () => q, in: () => q, not: () => q, is: () => q,
      order: () => q, limit: () => q,
      maybeSingle: async () => {
        if (tabela === 'webhook_events') return { data: estado.eventos.has(filtros.id) ? { id: filtros.id } : null, error: null };
        if (tabela === 'subscriptions') return { data: estado.sub, error: null };
        return { data: null, error: null };
      },
      insert: async (dados: any) => {
        estado.escritas.push({ tabela, op: 'insert', dados });
        if (tabela === 'webhook_events') {
          if (estado.eventos.has(dados.id)) return { error: { code: '23505', message: 'duplicate key' } };
          estado.eventos.add(dados.id);
        }
        return { error: null };
      },
      update: (dados: any) => { estado.escritas.push({ tabela, op: 'update', dados }); return q; },
      delete: () => { estado.escritas.push({ tabela, op: 'delete' }); return q; },
      then: (res: any) => res({ data: null, error: null }),
    };
    return q;
  };
  return { from };
}

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => criarSupabase(),
  getSettings: async () => ({ pagarme_api_key: 'sk_test_fake', pagarme_webhook_secret: 'usuario:senha' }),
}));
vi.mock('@/lib/ip-utils', () => ({ resolverIpConfiavel: () => null, ipParaRateLimit: (x: string) => x }));
vi.mock('@/lib/rate-limit-fallback', () => ({ dentroDoLimiteFallback: async () => true }));
vi.mock('./webhook-failure-log', () => ({ logWebhookFailure: vi.fn(async () => {}) }));
vi.mock('./promo-reajuste', () => ({ tentarReajustarPrimeiroCiclo: vi.fn(async () => ({ ok: true, reason: 'reajustado' })) }));
vi.mock('./ad-quota-grace', () => ({ reavaliarCotaAnuncios: vi.fn(async () => {}) }));

import { processPaymentWebhook } from './webhook-handler';
import { tentarReajustarPrimeiroCiclo } from './promo-reajuste';

function req(evento: any) {
  return new Request('http://localhost/api/webhooks/payments/pagarme', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('usuario:senha').toString('base64') },
    body: JSON.stringify(evento),
  });
}
const subscription = { id: 'sub_gw_1', customer: { id: 'cus_1' }, metadata: { subscription_id: 'sub-local-1' } };
const chargePaid = (idEvento: string) => ({ id: idEvento, type: 'charge.paid', data: { id: 'ch_1', invoice: { id: 'in_777', subscription }, subscription } });
const invoicePaid = (idEvento: string) => ({ id: idEvento, type: 'invoice.paid', data: { id: 'in_777', subscription } });

beforeEach(() => {
  estado.eventos.clear();
  estado.escritas.length = 0;
  estado.sub.promo_first_cycle_pending = false;
  vi.mocked(tentarReajustarPrimeiroCiclo).mockClear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('processPaymentWebhook — um pagamento, vários eventos (F02)', () => {
  it('pagamento já aplicado: o 2º evento (outro event id, mesma fatura) responde 200 e NÃO escreve na assinatura', async () => {
    estado.eventos.add('pagarme:pay:in_777'); // o 1º evento (invoice.paid) já aplicou esta fatura
    const res = await processPaymentWebhook(req(chargePaid('hook_charge_1')), 'pagarme');
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo.ignored).toBe('payment_already_applied');
    expect(estado.escritas.filter(e => e.tabela === 'subscriptions' && e.op === 'update')).toEqual([]);
    expect(estado.escritas.filter(e => e.tabela === 'profiles' || e.tabela === 'user_secrets')).toEqual([]);
    expect(tentarReajustarPrimeiroCiclo).not.toHaveBeenCalled();
  });

  it('o mesmo event id reenviado continua sendo tratado como duplicata simples (idempotência antiga preservada)', async () => {
    estado.eventos.add('pagarme:hook_dup');
    const res = await processPaymentWebhook(req(invoicePaid('hook_dup')), 'pagarme');
    const corpo = await res.json();
    expect(corpo.duplicate).toBe(true);
    expect(estado.escritas.length).toBe(0);
  });

  it('o 1º evento registra a chave do pagamento (pagarme:pay:<fatura>) além da do evento', async () => {
    await processPaymentWebhook(req(invoicePaid('hook_inv_1')), 'pagarme');
    expect(estado.eventos.has('pagarme:hook_inv_1')).toBe(true);
    expect(estado.eventos.has('pagarme:pay:in_777')).toBe(true);
    const insertsPagamento = estado.escritas.filter(e => e.tabela === 'webhook_events' && e.dados?.event_type === 'payment_applied');
    expect(insertsPagamento.length).toBe(1);
  });

  it('dois eventos da mesma fatura em sequência: só o primeiro chega a atualizar a assinatura', async () => {
    await processPaymentWebhook(req(invoicePaid('hook_seq_1')), 'pagarme');
    const antes = estado.escritas.filter(e => e.tabela === 'subscriptions' && e.op === 'update').length;
    const res2 = await processPaymentWebhook(req(chargePaid('hook_seq_2')), 'pagarme');
    expect((await res2.json()).ignored).toBe('payment_already_applied');
    const depois = estado.escritas.filter(e => e.tabela === 'subscriptions' && e.op === 'update').length;
    expect(depois).toBe(antes);
  });

  it('faturas DIFERENTES (renovações de meses diferentes) continuam sendo aplicadas normalmente', async () => {
    await processPaymentWebhook(req(invoicePaid('hook_a')), 'pagarme');
    const novaFatura = { id: 'hook_b', type: 'invoice.paid', data: { id: 'in_888', subscription } };
    const res = await processPaymentWebhook(req(novaFatura), 'pagarme');
    expect((await res.json()).ignored).toBeUndefined();
    expect(estado.eventos.has('pagarme:pay:in_888')).toBe(true);
  });
});
