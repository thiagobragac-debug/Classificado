import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regressão direta do bug corrigido ao vivo em produção (2026-09-26):
// getAllSitemapEntries() tinha um único try/catch pra todas as seções —
// a falha de UMA fonte de dados (a query de `eventos` batendo numa coluna
// que ainda não existia no banco) derrubava TODAS as outras seções
// (ads/vendedores/categorias/leilões) junto, caindo no fallback de
// emergência de só 5 URLs estáticas. safeQuery() isola cada seção; este
// teste simula exatamente esse cenário (uma tabela falhando, as demais
// saudáveis) e comprova que só a seção que falhou fica de fora.

const { tableConfig } = vi.hoisted(() => ({
  tableConfig: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/lib/supabase-server', () => ({
  createAnonClient: () => ({
    from: (table: string) => {
      const cfg = tableConfig[table] ?? { data: [], error: null };
      const builder: {
        select: () => typeof builder;
        eq: () => typeof builder;
        neq: () => typeof builder;
        in: () => typeof builder;
        order: () => typeof builder;
        range: () => typeof builder;
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
      } = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        in: () => builder,
        order: () => builder,
        range: () => builder,
        then: (resolve, reject) => Promise.resolve(cfg).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import { getAllSitemapEntries } from './sitemap-data';

function healthyTableConfig() {
  return {
    categories: { data: [{ id: 'cat-bovinos' }], error: null },
    institutional_pages: { data: [], error: null },
    ads: {
      data: [
        { id: 'ad1', slug: 'anuncio-teste', user_id: 'user1', category_id: 'cat-bovinos', updated_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    },
    profiles: {
      data: [{ id: 'user1', slug: 'vendedor-teste', updated_at: null, created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    },
    auction_events: {
      data: [{ id: 'auc1', slug: 'leilao-teste', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    },
    eventos: {
      data: [{ id: 'ev1', slug: 'evento-teste', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
  Object.assign(tableConfig, healthyTableConfig());
});

describe('getAllSitemapEntries — caminho feliz', () => {
  it('inclui entradas de todas as seções quando tudo responde normalmente', async () => {
    const entries = await getAllSitemapEntries();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/anuncio/anuncio-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/vendedor/vendedor-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/leiloes/leilao-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/eventos/evento-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/categoria/cat-bovinos'))).toBe(true);
  });
});

describe('getAllSitemapEntries — isolamento de falha por seção', () => {
  it('uma falha isolada em "eventos" não derruba ads/vendedores/categorias/leilões (regressão do bug de produção)', async () => {
    tableConfig.eventos = { data: null, error: new Error('column eventos.slug does not exist') };

    const entries = await getAllSitemapEntries();
    const urls = entries.map((e) => e.url);

    // A seção quebrada fica de fora...
    expect(urls.some((u) => u.includes('/eventos/evento-teste'))).toBe(false);

    // ...mas todas as outras continuam presentes — ANTES da correção, TODAS
    // essas entradas também desapareciam junto (fallback de emergência).
    expect(urls.some((u) => u.endsWith('/anuncio/anuncio-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/vendedor/vendedor-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/leiloes/leilao-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/categoria/cat-bovinos'))).toBe(true);

    // Não colapsou pro fallback de emergência (só 5 URLs estáticas).
    expect(entries.length).toBeGreaterThan(5);
  });

  it('uma falha em "ads" não impede categorias/vendedores/leilões/eventos de aparecerem', async () => {
    tableConfig.ads = { data: null, error: new Error('timeout') };

    const entries = await getAllSitemapEntries();
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.includes('/anuncio/'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/eventos/evento-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/leiloes/leilao-teste'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/categoria/cat-bovinos'))).toBe(true);
    // Vendedores dependem de ads (user_id) — sem ads, também ficam vazios,
    // mas isso não deve derrubar o resto (mesmo raciocínio de isolamento).
    expect(entries.length).toBeGreaterThan(5);
  });
});
