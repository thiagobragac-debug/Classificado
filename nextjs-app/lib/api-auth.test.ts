import { describe, it, expect } from 'vitest';
import { sha256, hasPermission, apiError, corsHeaders, rateLimitHeaders, type ApiKey } from './api-auth';

function fakeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'test-id',
    partner_name: 'Parceiro Teste',
    permissions: [],
    rate_limit: 100,
    environment: 'sandbox',
    is_active: true,
    expires_at: null,
    last_used_at: null,
    ...overrides,
  };
}

describe('sha256', () => {
  it('produz o hex conhecido para uma entrada fixa', async () => {
    // Valor de referência calculado fora do teste com:
    //   node -e "console.log(require('crypto').createHash('sha256').update('tk_test').digest('hex'))"
    expect(await sha256('tk_test')).toBe(
      'c566158525c2647f59ef9a390eacf7f9dc66550ac0a984712fa02c71c7d31e82'
    );
  });

  it('é determinístico e sensível a qualquer mudança na entrada', async () => {
    const a = await sha256('tk_abc123');
    const b = await sha256('tk_abc123');
    const c = await sha256('tk_abc124');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hasPermission', () => {
  it('full_access libera qualquer permissão pedida', () => {
    expect(hasPermission(fakeApiKey({ permissions: ['full_access'] }), 'write_ads')).toBe(true);
    expect(hasPermission(fakeApiKey({ permissions: ['full_access'] }), 'qualquer_coisa')).toBe(true);
  });

  it('exige a permissão exata quando não há full_access', () => {
    const key = fakeApiKey({ permissions: ['read_ads'] });
    expect(hasPermission(key, 'read_ads')).toBe(true);
    expect(hasPermission(key, 'write_ads')).toBe(false);
  });

  it('sem nenhuma permissão, tudo é negado', () => {
    expect(hasPermission(fakeApiKey({ permissions: [] }), 'read_ads')).toBe(false);
  });
});

describe('apiError', () => {
  it('gera Response com o status e corpo esperados', async () => {
    const res = apiError('Não autorizado', 401);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Não autorizado', status: 401 });
  });

  it('inclui campos extras no corpo', async () => {
    const res = apiError('Rate limit', 429, { retry_after: '2026-01-01T00:00:00Z' });
    const body = await res.json();
    expect(body.retry_after).toBe('2026-01-01T00:00:00Z');
  });

  it('sempre inclui os cabeçalhos de CORS', () => {
    const res = apiError('erro', 500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('rateLimitHeaders', () => {
  it('reflete o limite da própria chave e o restante informado', () => {
    const headers = rateLimitHeaders(fakeApiKey({ rate_limit: 250 }), 10, '2026-01-01T00:00:00Z');
    expect(headers['X-RateLimit-Limit']).toBe('250');
    expect(headers['X-RateLimit-Remaining']).toBe('10');
    expect(headers['X-RateLimit-Reset']).toBe('2026-01-01T00:00:00Z');
  });
});

describe('corsHeaders', () => {
  it('usa GET, POST, OPTIONS por padrão', () => {
    expect(corsHeaders()['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
  });

  it('aceita lista de métodos customizada', () => {
    expect(corsHeaders('GET, OPTIONS')['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });
});
