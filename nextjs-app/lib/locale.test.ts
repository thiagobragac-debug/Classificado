import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  stripLocale,
  localizedPath,
  switchLocalePath,
  switchLocaleQuery,
  buildHreflangAlternates,
} from './locale';

// lib/locale.ts nunca teve teste automatizado (achado numa revisão de
// cobertura, 2026-09-26) apesar de ser exatamente o módulo cujo fallback de
// SITE_URL causou o bug de SEO sitewide desta sessão (canonical/hreflang/OG/
// sitemap inteiros apontando pro host sem www, que só redireciona). Essas
// funções são puras e determinísticas — não tinha motivo real pra estarem
// descobertas.

describe('stripLocale', () => {
  it('remove o prefixo /es sozinho, virando a raiz', () => {
    expect(stripLocale('/es')).toBe('/');
  });

  it('remove o prefixo /es de um path mais longo', () => {
    expect(stripLocale('/es/anuncio/abc123')).toBe('/anuncio/abc123');
  });

  it('não mexe num path sem prefixo /es', () => {
    expect(stripLocale('/anuncio/abc123')).toBe('/anuncio/abc123');
  });

  it('não confunde um path que só COMEÇA com "es" (ex.: /estacionamento) com o prefixo de locale', () => {
    expect(stripLocale('/estacionamento')).toBe('/estacionamento');
  });
});

describe('localizedPath', () => {
  it('prefixa a raiz com /es quando locale é es', () => {
    expect(localizedPath('/', 'es')).toBe('/es');
  });

  it('prefixa um path normal com /es quando locale é es', () => {
    expect(localizedPath('/anuncio/abc123', 'es')).toBe('/es/anuncio/abc123');
  });

  it('não prefixa nada quando locale é pt', () => {
    expect(localizedPath('/anuncio/abc123', 'pt')).toBe('/anuncio/abc123');
    expect(localizedPath('/', 'pt')).toBe('/');
  });
});

describe('switchLocalePath', () => {
  it('de uma URL em ES pra PT: remove o /es', () => {
    expect(switchLocalePath('/es/anuncio/abc123', 'pt')).toBe('/anuncio/abc123');
  });

  it('de uma URL em PT pra ES: adiciona o /es', () => {
    expect(switchLocalePath('/anuncio/abc123', 'es')).toBe('/es/anuncio/abc123');
  });

  it('é idempotente trocando pro mesmo idioma que já está', () => {
    expect(switchLocalePath('/es/anuncio/abc123', 'es')).toBe('/es/anuncio/abc123');
    expect(switchLocalePath('/anuncio/abc123', 'pt')).toBe('/anuncio/abc123');
  });
});

describe('switchLocaleQuery', () => {
  it('gera ?setLocale=X quando não há querystring prévia', () => {
    expect(switchLocaleQuery('es', '')).toBe('?setLocale=es');
  });

  it('preserva parâmetros existentes e adiciona/atualiza setLocale', () => {
    const qs = switchLocaleQuery('pt', '?q=touro&page=2');
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get('q')).toBe('touro');
    expect(params.get('page')).toBe('2');
    expect(params.get('setLocale')).toBe('pt');
  });

  it('sobrescreve um setLocale já existente na query em vez de duplicar', () => {
    const qs = switchLocaleQuery('es', '?setLocale=pt');
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get('setLocale')).toBe('es');
    expect([...params.keys()].filter(k => k === 'setLocale')).toHaveLength(1);
  });
});

describe('buildHreflangAlternates', () => {
  it('gera pt-BR/es/x-default a partir de um path sem prefixo', () => {
    const alt = buildHreflangAlternates('https://www.tauzeclass.com.br', '/anuncio/abc123');
    expect(alt).toEqual({
      'pt-BR': 'https://www.tauzeclass.com.br/anuncio/abc123',
      es: 'https://www.tauzeclass.com.br/es/anuncio/abc123',
      'x-default': 'https://www.tauzeclass.com.br/anuncio/abc123',
    });
  });

  it('x-default sempre aponta pra variante PT (não ES)', () => {
    const alt = buildHreflangAlternates('https://www.tauzeclass.com.br', '/');
    expect(alt['x-default']).toBe(alt['pt-BR']);
    expect(alt['x-default']).not.toBe(alt.es);
  });
});

// SITE_URL é uma const de módulo computada uma vez na primeira importação —
// pra testar as duas ramificações do fallback precisamos reimportar o módulo
// do zero em cada cenário (vi.resetModules), simulando o ambiente de
// produção real (Render nunca configurou NEXT_PUBLIC_SITE_URL) e um
// ambiente hipotético que a configurasse.
describe('SITE_URL (fallback)', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  });

  // BUG CORRIGIDO (auditoria de SEO, 2026-09-26): o fallback antigo apontava
  // pro host SEM www, que o próprio site sempre redireciona (301) — nunca
  // serve 200. Regressão direta desse achado: o fallback tem que ser o host
  // que efetivamente responde 200 em produção.
  it('sem NEXT_PUBLIC_SITE_URL configurada, cai no host com www (o que responde 200 em produção)', async () => {
    vi.resetModules();
    const { SITE_URL } = await import('./locale');
    expect(SITE_URL).toBe('https://www.tauzeclass.com.br');
  });

  it('com NEXT_PUBLIC_SITE_URL configurada, usa o valor da env var', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.tauzeclass.com.br';
    vi.resetModules();
    const { SITE_URL } = await import('./locale');
    expect(SITE_URL).toBe('https://staging.tauzeclass.com.br');
  });
});
