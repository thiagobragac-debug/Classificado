import { describe, it, expect, vi, afterEach } from 'vitest';
import { tentarReajustarPrimeiroCiclo } from './promo-reajuste';

// Mock mínimo do encadeamento Supabase realmente usado por
// tentarReajustarPrimeiroCiclo -- não precisa ser um fake genérico do SDK,
// só suportar .from(table).select(...) / .update(patch).eq(...).lt(...)
// .is(...).select('id') / .insert(...), resolvendo como thenable no fim da
// cadeia (mesmo padrão já usado em sitemap-data.test.ts e StepData.test.tsx).
function criarSupabaseFake(opts: {
  settings?: Record<string, string>;
  /** Quantas linhas o UPDATE do lease (o 1o update, que grava promo_reajuste_last_attempted_at) deve "afetar". 0 = lease negado. */
  leaseRows?: number;
} = {}) {
  const settings = opts.settings ?? {
    pagarme_api_key: 'sk_test_fake',
  };
  const leaseRows = opts.leaseRows ?? 1;
  const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];

  function makeUpdateBuilder(table: string, patch: Record<string, unknown>) {
    // O 1o update que uma chamada faz em `subscriptions` é sempre o lease
    // (grava promo_reajuste_last_attempted_at); o 2o (se chegar lá) é o
    // update final de sucesso -- diferenciamos pela presença do campo.
    const isLeaseUpdate = 'promo_reajuste_last_attempted_at' in patch;
    const builder: any = {
      eq: () => builder,
      lt: () => builder,
      is: () => builder,
      select: () => {
        const rows = table === 'subscriptions' && isLeaseUpdate
          ? Array.from({ length: leaseRows }, (_, i) => ({ id: `row-${i}` }))
          : [{ id: 'row-0' }]; // update final de sucesso -- sempre "afeta" 1 linha nestes testes
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      return {
        select: (_cols: string) => {
          if (table === 'platform_settings') {
            const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
            return Promise.resolve({ data: rows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        update: (patch: Record<string, unknown>) => {
          updateCalls.push({ table, patch });
          return makeUpdateBuilder(table, patch);
        },
        insert: (row: Record<string, unknown>) => {
          insertCalls.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    updateCalls,
    insertCalls,
  };
}

const SUB_BASE = {
  id: 'sub-1',
  gateway: 'pagarme' as const,
  gateway_subscription_id: 'gw-sub-1',
  plan: 'Produtor PRO',
  billing_cycle: 'monthly' as const,
  currency: 'BRL',
  promo_full_price: 79,
  promo_reajuste_attempts: 0,
  promo_reajuste_last_attempted_at: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tentarReajustarPrimeiroCiclo', () => {
  it('reajusta com sucesso: chama updateSubscriptionPlan com nonce determinístico e confirma localmente', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      // pagarme.ts::updateSubscriptionPlan faz 2 chamadas: 1o um GET em
      // /subscriptions/{id} (sem /items no path) pra achar o itemId, depois
      // um PUT em /subscriptions/{id}/items/{itemId} pra trocar o preço.
      if (String(url).includes('/items/')) {
        return { ok: true, json: async () => ({ subscription_id: 'gw-sub-1' }) } as any;
      }
      return { ok: true, json: async () => ({ items: [{ id: 'item-1' }], next_billing_at: '2026-11-01T00:00:00Z' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const supabase = criarSupabaseFake();
    const r = await tentarReajustarPrimeiroCiclo(supabase as any, { ...SUB_BASE });

    expect(r).toEqual({ ok: true, reason: 'reajustado' });
    expect(fetchMock).toHaveBeenCalled();
    // 2 updates em subscriptions: o lease e a confirmação final.
    const subUpdates = supabase.updateCalls.filter(c => c.table === 'subscriptions');
    expect(subUpdates.length).toBe(2);
    expect(subUpdates[1].patch).toMatchObject({ promo_first_cycle_pending: false, price: 79 });
  });

  it('adapter falhando: não lança, marca promo_reajuste_last_error, não confirma promo_first_cycle_pending=false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'erro fake do gateway' } as any)));

    const supabase = criarSupabaseFake();
    const r = await tentarReajustarPrimeiroCiclo(supabase as any, { ...SUB_BASE });

    expect(r.ok).toBe(false);
    const subUpdates = supabase.updateCalls.filter(c => c.table === 'subscriptions');
    // 2 updates: o lease, e o registro de promo_reajuste_last_error -- nunca
    // chega no update de confirmação (promo_first_cycle_pending: false).
    expect(subUpdates.length).toBe(2);
    expect(subUpdates.some(c => 'promo_first_cycle_pending' in c.patch)).toBe(false);
    expect(supabase.insertCalls.some(c => c.table === 'webhook_failures')).toBe(true);
  });

  it('segunda tentativa não dispara nenhuma chamada de rede quando o lease já foi resolvido (idempotência)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // leaseRows=0 simula que outro processo (webhook ou cron) já resolveu
    // esta linha primeiro -- o WHERE promo_first_cycle_pending=true do
    // lease não afeta nenhuma linha.
    const supabase = criarSupabaseFake({ leaseRows: 0 });
    const r = await tentarReajustarPrimeiroCiclo(supabase as any, { ...SUB_BASE });

    expect(r).toEqual({ ok: false, reason: 'lease_not_acquired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bypass local (cupom 100%, sem gateway_subscription_id): encerra o pendente sem chamar rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const supabase = criarSupabaseFake();
    const r = await tentarReajustarPrimeiroCiclo(supabase as any, { ...SUB_BASE, gateway_subscription_id: null });

    expect(r).toEqual({ ok: true, reason: 'no_gateway_subscription_bypass' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gateway sem credenciais configuradas: falha sem lançar, loga em webhook_failures', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const supabase = criarSupabaseFake({ settings: {} }); // sem pagarme_api_key
    const r = await tentarReajustarPrimeiroCiclo(supabase as any, { ...SUB_BASE });

    expect(r).toEqual({ ok: false, reason: 'adapter_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabase.insertCalls.some(c => c.table === 'webhook_failures')).toBe(true);
  });
});
