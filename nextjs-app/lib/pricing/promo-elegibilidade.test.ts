import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usuarioJaConsumiuPromo, STATUS_QUE_PROVAM_PAGAMENTO } from './promo-elegibilidade';

// F01 (auditoria 12/out/2026): a promoção vale uma vez por usuário. Estes testes
// usam um Supabase falso que APLICA os filtros de verdade (o fake de
// promo-reajuste.test.ts ignora todos), então remover um filtro da regra quebra
// o teste.
type Linha = { id: string; user_id: string; price: number; status: string; current_period_end: string | null };

function criarSupabase(linhas: Linha[], erro?: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let limite = Infinity;
  const q: any = {
    select: () => q,
    eq: (c: keyof Linha, v: any) => (filtros.push(l => l[c] === v), q),
    neq: (c: keyof Linha, v: any) => (filtros.push(l => l[c] !== v), q),
    gt: (c: keyof Linha, v: number) => (filtros.push(l => Number(l[c]) > v), q),
    not: (c: keyof Linha, op: string, v: any) => (op === 'is' && v === null ? filtros.push(l => l[c] !== null) : null, q),
    in: (c: keyof Linha, vs: any[]) => (filtros.push(l => vs.includes(l[c])), q),
    limit: (n: number) => ((limite = n), q),
    then: (res: any) => res(erro ? { data: null, error: { message: erro } } : { data: linhas.filter(l => filtros.every(f => f(l))).slice(0, limite).map(l => ({ id: l.id })), error: null }),
  };
  return { from: () => q } as any;
}

const U = 'user-1';
const base = (o: Partial<Linha>): Linha => ({ id: 's1', user_id: U, price: 39.5, status: 'cancelled', current_period_end: '2026-11-01T00:00:00Z', ...o });

describe('usuarioJaConsumiuPromo', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('usuário sem nenhuma assinatura: elegível (false)', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([]), U)).toBe(false);
  });

  it.each(['active', 'past_due', 'cancelled', 'expired', 'switch_applied'])(
    'assinatura paga em status %s (cancelar e reassinar!) já consumiu a promo',
    async (status) => {
      expect(await usuarioJaConsumiuPromo(criarSupabase([base({ status })]), U)).toBe(true);
    },
  );

  it('checkout abandonado/recusado (pending, sem período concedido) NÃO consome a promo', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ status: 'pending', current_period_end: null })]), U)).toBe(false);
  });

  it('linha sem current_period_end (nunca ativada) não conta, mesmo em status que normalmente conta', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ status: 'expired', current_period_end: null })]), U)).toBe(false);
  });

  it('cupom 100% (preço 0) não conta como compra paga', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ price: 0, status: 'active' })]), U)).toBe(false);
  });

  it('assinatura de OUTRO usuário não conta', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ user_id: 'outro' })]), U)).toBe(false);
  });

  it('ignora a própria linha (retry do mesmo checkoutId)', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ id: 'chk-atual', status: 'active' })]), U, 'chk-atual')).toBe(false);
    expect(await usuarioJaConsumiuPromo(criarSupabase([base({ id: 'chk-atual', status: 'active' }), base({ id: 'antiga' })]), U, 'chk-atual')).toBe(true);
  });

  it('erro de banco: falha FECHADA (true = nega a promo, cobra cheio)', async () => {
    expect(await usuarioJaConsumiuPromo(criarSupabase([], 'connection reset'), U)).toBe(true);
  });

  it('a lista de status que provam pagamento cobre os estados terminais reais', () => {
    expect([...STATUS_QUE_PROVAM_PAGAMENTO].sort()).toEqual(['active', 'cancelled', 'expired', 'past_due', 'switch_applied']);
  });
});
