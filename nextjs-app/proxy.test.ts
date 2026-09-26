import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import {
  buildCsp,
  applySecurityHeaders,
  paisParaLocale,
  stripLocalePrefix,
  withLocale,
} from './proxy';

// proxy.ts (middleware) nunca teve teste automatizado (achado numa revisão
// de cobertura, 2026-09-26) apesar de concentrar boa parte dos bugs REAIS
// já corrigidos nesta sessão: idioma revertendo sozinho (paisParaLocale/
// stripLocalePrefix), geoip resolvendo sempre Washington DC, e uma lista
// longa de integrações de terceiro (Stripe/Mercado Pago/Pagar.me/AdSense/
// GA4/Turnstile/Google Identity) quebradas silenciosamente por um host
// faltando em buildCsp() — cada uma só descoberta ao vivo, no console do
// navegador. As 5 funções abaixo foram exportadas (mudança aditiva, sem
// alterar comportamento) especificamente para poderem ser testadas aqui,
// isoladas do handler proxy() principal (que exige mockar NextRequest e
// rede/Supabase — fora de escopo desta rodada, ver PR/commit).

describe('paisParaLocale', () => {
  it('mapeia países de língua espanhola do Mercosul pra es', () => {
    expect(paisParaLocale('AR')).toBe('es');
    expect(paisParaLocale('PY')).toBe('es');
    expect(paisParaLocale('UY')).toBe('es');
  });

  it('qualquer outro país (incluindo Brasil) cai em pt', () => {
    expect(paisParaLocale('BR')).toBe('pt');
    expect(paisParaLocale('US')).toBe('pt');
  });

  it('sem sinal de geo (null — ex.: localhost em dev) cai em pt', () => {
    expect(paisParaLocale(null)).toBe('pt');
  });
});

describe('stripLocalePrefix', () => {
  it('reconhece /es sozinho como raiz em ES', () => {
    expect(stripLocalePrefix('/es')).toEqual({ effectivePath: '/', urlLocale: 'es' });
  });

  it('remove o prefixo /es de um path mais longo', () => {
    expect(stripLocalePrefix('/es/anuncio/abc123')).toEqual({
      effectivePath: '/anuncio/abc123',
      urlLocale: 'es',
    });
  });

  it('não mexe num path sem prefixo /es', () => {
    expect(stripLocalePrefix('/anuncio/abc123')).toEqual({
      effectivePath: '/anuncio/abc123',
      urlLocale: null,
    });
  });

  // BUG-CLASSE evitado (mesma lógica de lib/locale.ts::stripLocale, testada
  // lá): um path que só COMEÇA com "es" não pode ser confundido com o
  // prefixo de locale.
  it('não confunde /estacionamento com o prefixo /es', () => {
    expect(stripLocalePrefix('/estacionamento')).toEqual({
      effectivePath: '/estacionamento',
      urlLocale: null,
    });
  });
});

describe('withLocale', () => {
  it('prefixa com /es quando o locale é es', () => {
    expect(withLocale('/painel', 'es')).toBe('/es/painel');
    expect(withLocale('/', 'es')).toBe('/es');
  });

  it('não prefixa nada quando o locale é pt', () => {
    expect(withLocale('/painel', 'pt')).toBe('/painel');
  });
});

describe('buildCsp', () => {
  it('gera um nonce de script-src pra rotas normais (não-checkout)', () => {
    const csp = buildCsp('abc123nonce', '/anuncio/xyz');
    expect(csp).toContain("'nonce-abc123nonce'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  // GAP DE INTEGRAÇÃO CORRIGIDO (auditoria completa, 2026-08-25): /planos é a
  // única rota que abre mão do nonce (Card Payment Brick do Mercado Pago
  // injeta script inline próprio, sem nonce, fora do nosso controle).
  it('abre mão do nonce em unsafe-inline só na rota de checkout (/planos)', () => {
    const csp = buildCsp('abc123nonce', '/planos');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('não trata uma rota parecida (ex.: /planos-antigos) como checkout', () => {
    const csp = buildCsp('abc123nonce', '/planos-antigos');
    expect(csp).toContain("'nonce-abc123nonce'");
  });

  // Regressão dos hosts de terceiro que já quebraram silenciosamente em
  // produção nesta sessão — cada linha abaixo corresponde a um bug real já
  // corrigido (ver comentários de cada allowlist em proxy.ts).
  it('libera todos os hosts de terceiro já identificados como necessários', () => {
    const csp = buildCsp('n', '/');
    // Stripe / Mercado Pago / Pagar.me (checkout)
    expect(csp).toContain('https://js.stripe.com');
    expect(csp).toContain('https://sdk.mercadopago.com');
    expect(csp).toContain('https://http2.mlstatic.com');
    expect(csp).toContain('https://api.pagar.me');
    // Login com Google / Turnstile
    expect(csp).toContain('https://accounts.google.com');
    expect(csp).toContain('https://challenges.cloudflare.com');
    // AdSense
    expect(csp).toContain('https://pagead2.googlesyndication.com');
    expect(csp).toContain('https://*.adtrafficquality.google');
    // GA4 — script + beacon (connect-src) + beacon de imagem (img-src)
    expect(csp).toContain('https://www.googletagmanager.com');
    expect(csp).toContain('https://www.google-analytics.com');
  });

  it('em produção não libera unsafe-eval; fora de produção libera (Turbopack/React Refresh)', () => {
    const original = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = 'production';
      expect(buildCsp('n', '/')).not.toContain("'unsafe-eval'");
      (process.env as Record<string, string>).NODE_ENV = 'development';
      expect(buildCsp('n', '/')).toContain("'unsafe-eval'");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = original as string;
    }
  });
});

describe('applySecurityHeaders', () => {
  it('aplica o header Content-Security-Policy com o CSP fornecido', () => {
    const res = applySecurityHeaders(NextResponse.next(), "default-src 'self'");
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
  });

  it('aplica os SECURITY_HEADERS compartilhados (ex.: nosniff)', () => {
    const res = applySecurityHeaders(NextResponse.next(), "default-src 'self'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
