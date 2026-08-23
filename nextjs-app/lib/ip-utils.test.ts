import { describe, it, expect } from 'vitest';
import { resolverIpConfiavel, isValidIp, isLocalIp } from './ip-utils';

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

describe('resolverIpConfiavel', () => {
  it('usa x-vercel-forwarded-for quando presente, mesmo com outros headers', () => {
    expect(
      resolverIpConfiavel(headers({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.1' }))
    ).toBe('203.0.113.9');
  });

  it('cai para x-real-ip na ausência do header da Vercel', () => {
    expect(resolverIpConfiavel(headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('usa o ÚLTIMO item do x-forwarded-for, não o primeiro', () => {
    // O atacante controla o início da lista; cada proxy no caminho anexa o
    // que observou. Regressão direta do bug corrigido em 6b3c275.
    expect(resolverIpConfiavel(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('rotacionar o primeiro item do x-forwarded-for não muda o resultado', () => {
    const fixo = '203.0.113.9';
    const resultados = new Set(
      ['1.1.1.1', '2.2.2.2', '9.9.9.9'].map((forjado) =>
        resolverIpConfiavel(headers({ 'x-forwarded-for': `${forjado}, ${fixo}` }))
      )
    );
    expect(resultados).toEqual(new Set([fixo]));
  });

  it('volta para 127.0.0.1 quando nenhum header existe', () => {
    expect(resolverIpConfiavel(headers({}))).toBe('127.0.0.1');
  });

  it('ignora espaços em volta do valor', () => {
    expect(resolverIpConfiavel(headers({ 'x-forwarded-for': ' 1.2.3.4 ,  203.0.113.9  ' }))).toBe('203.0.113.9');
  });
});

describe('isValidIp', () => {
  it.each(['203.0.113.9', '0.0.0.0', '255.255.255.255', '::1', '2001:db8::1'])(
    'aceita %s',
    (ip) => expect(isValidIp(ip)).toBe(true)
  );

  it.each([
    '',
    'nao-e-ip',
    '999.999.999.999',
    '1.2.3',
    '1.2.3.4.5',
    '../../etc/passwd',
    '1.2.3.4/evil',
  ])('rejeita %s', (ip) => expect(isValidIp(ip)).toBe(false));
});

describe('isLocalIp', () => {
  it.each(['127.0.0.1', '::1', '192.168.1.1', '10.0.0.1', '172.16.0.1', '172.31.255.255'])(
    '%s é reconhecido como local/privado',
    (ip) => expect(isLocalIp(ip)).toBe(true)
  );

  it.each(['203.0.113.9', '8.8.8.8', '1.1.1.1'])(
    '%s é reconhecido como público',
    (ip) => expect(isLocalIp(ip)).toBe(false)
  );

  it('string vazia é tratada como local', () => {
    expect(isLocalIp('')).toBe(true);
  });
});
