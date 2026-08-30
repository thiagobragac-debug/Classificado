import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from './sanitize';

describe('sanitizeHtml', () => {
  it('preserva formatação básica permitida', () => {
    expect(sanitizeHtml('<p>Olá <strong>mundo</strong></p>')).toBe('<p>Olá <strong>mundo</strong></p>');
  });

  it('remove <script>', () => {
    const out = sanitizeHtml('<p>oi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
  });

  it('remove atributo onerror em <img> mesmo com a tag fora da allowlist', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img');
  });

  it('remove onclick de um elemento permitido', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">clique</p>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('clique');
  });

  it('remove atributo style (pode conter url() executável)', () => {
    const out = sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p>');
    expect(out).not.toContain('style');
  });

  it('mantém href em links mas neutraliza javascript:', () => {
    const limpo = sanitizeHtml('<a href="javascript:alert(1)">clique</a>');
    expect(limpo.toLowerCase()).not.toContain('javascript:');
  });

  it('remove tag não permitida (iframe) preservando o texto ao redor quando aplicável', () => {
    const out = sanitizeHtml('<p>antes</p><iframe src="//evil.com"></iframe><p>depois</p>');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('antes');
    expect(out).toContain('depois');
  });

  it('null/undefined retornam string vazia', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });

  // BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): a allowlist de
  // leitura de anuncio/[id]/page.tsx divergia desta (sem 'a'/'u'/'s'), então
  // um link, sublinhado ou tachado formatado no editor sobrevivia à
  // gravação e desaparecia só na página pública. Trava aqui a allowlist que
  // agora é compartilhada entre escrita e leitura.
  it('preserva sublinhado e tachado (toolbar do editor de descrição)', () => {
    expect(sanitizeHtml('<u>sublinhado</u> e <s>tachado</s>')).toBe('<u>sublinhado</u> e <s>tachado</s>');
  });

  it('preserva link com href/target/rel', () => {
    const out = sanitizeHtml('<a href="https://exemplo.com" target="_blank">site</a>');
    expect(out).toContain('href="https://exemplo.com"');
    expect(out).toContain('site');
  });

  // BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): href/target
  // passaram a sobreviver de verdade nesta rodada — sem isto, um link com
  // target="_blank" e sem rel="noopener" permite que a página de destino
  // acesse window.opener e redirecione a aba original (reverse tabnabbing).
  it('força rel="noopener noreferrer" quando target="_blank"', () => {
    const out = sanitizeHtml('<a href="https://exemplo.com" target="_blank">site</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('não força rel quando não há target="_blank" (não muda comportamento de link interno)', () => {
    const out = sanitizeHtml('<a href="/interno">site</a>');
    expect(out).not.toContain('rel=');
  });
});

describe('sanitizeText', () => {
  it('remove toda marcação, restando só o texto', () => {
    expect(sanitizeText('<p>Olá <strong>mundo</strong></p>')).toBe('Olá mundo');
  });

  it('neutraliza script por completo', () => {
    const out = sanitizeText('<script>alert(1)</script>texto');
    expect(out).not.toContain('<script');
    expect(out).toContain('texto');
  });

  it('null/undefined retornam string vazia', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
});
