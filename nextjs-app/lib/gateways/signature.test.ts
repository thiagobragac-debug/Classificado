import { describe, it, expect, vi, afterEach } from 'vitest';
import { assinaturaConfere, timestampRecente } from './signature';

describe('assinaturaConfere', () => {
  it('true quando os hex são idênticos', () => {
    const hash = 'a'.repeat(64);
    expect(assinaturaConfere(hash, hash)).toBe(true);
  });

  it('false quando diferem em um único caractere', () => {
    expect(assinaturaConfere('a'.repeat(64), 'a'.repeat(63) + 'b')).toBe(false);
  });

  it('false quando o tamanho difere, sem lançar (timingSafeEqual exigiria buffers iguais)', () => {
    expect(assinaturaConfere('a'.repeat(64), 'a'.repeat(63))).toBe(false);
    expect(() => assinaturaConfere('a'.repeat(64), 'a'.repeat(63))).not.toThrow();
  });

  it('false quando a assinatura recebida é ausente', () => {
    expect(assinaturaConfere('a'.repeat(64), undefined)).toBe(false);
    expect(assinaturaConfere('a'.repeat(64), null)).toBe(false);
    expect(assinaturaConfere('a'.repeat(64), '')).toBe(false);
  });
});

describe('timestampRecente', () => {
  const AGORA = 1_800_000_000_000; // fixo, para o teste não depender do relógio real

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita timestamp em segundos dentro da janela padrão (5 min)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const tsSegundos = String(Math.floor((AGORA - 60_000) / 1000)); // 1 min atrás
    expect(timestampRecente(tsSegundos)).toBe(true);
  });

  it('aceita timestamp em milissegundos dentro da janela', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    expect(timestampRecente(String(AGORA - 60_000))).toBe(true);
  });

  it('rejeita timestamp fora da janela — cenário de replay', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const dezMinutosAtras = String(Math.floor((AGORA - 10 * 60_000) / 1000));
    expect(timestampRecente(dezMinutosAtras)).toBe(false);
  });

  it('rejeita timestamp no futuro além da tolerância', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const futuro = String(Math.floor((AGORA + 10 * 60_000) / 1000));
    expect(timestampRecente(futuro)).toBe(false);
  });

  it('respeita tolerância customizada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const doisMinAtras = String(Math.floor((AGORA - 2 * 60_000) / 1000));
    expect(timestampRecente(doisMinAtras, 60)).toBe(false);
    expect(timestampRecente(doisMinAtras, 300)).toBe(true);
  });

  it('rejeita entrada ausente, vazia ou não numérica', () => {
    expect(timestampRecente(undefined)).toBe(false);
    expect(timestampRecente(null)).toBe(false);
    expect(timestampRecente('')).toBe(false);
    expect(timestampRecente('nao-e-numero')).toBe(false);
    expect(timestampRecente('-100')).toBe(false);
    expect(timestampRecente('0')).toBe(false);
  });
});
