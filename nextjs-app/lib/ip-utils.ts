// Resolução e validação de IP de cliente, compartilhada por proxy.ts e pela
// rota de geolocalização.
//
// Extraído para cá porque a mesma lógica existia duplicada nos dois lugares
// (cada um com sua própria leitura de x-forwarded-for) e porque testá-la
// contra NextRequest exigiria montar um request completo. Um objeto com
// `.get(name)` é o bastante — Headers do Fetch API já satisfaz isso.

export interface HeaderLike {
  get(name: string): string | null;
}

/**
 * Resolve o IP do cliente a partir de headers de proxy.
 *
 * `x-forwarded-for` é enviado pelo cliente. O PRIMEIRO item da lista é
 * exatamente a parte que ele controla: cada proxy pelo caminho *anexa* o IP de
 * quem se conectou a ele, então o início da lista é texto livre e o fim é o
 * que o proxy mais próximo realmente observou.
 *
 * Ordem de preferência:
 *   1. x-vercel-forwarded-for — a plataforma sobrescreve, o cliente não forja
 *   2. x-real-ip              — idem, quando há proxy que o defina
 *   3. último item do x-forwarded-for
 */
export function resolverIpConfiavel(headers: HeaderLike): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel.split(',').pop()!.trim();

  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;

  const encaminhado = headers.get('x-forwarded-for');
  if (encaminhado) {
    const ultimo = encaminhado.split(',').pop()?.trim();
    if (ultimo) return ultimo;
  }

  return '127.0.0.1';
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]{2,45}$/;

/**
 * Confirma que a string é um IPv4 ou IPv6 sintaticamente válido.
 *
 * Necessário sempre que o valor entra concatenado numa URL que o servidor
 * busca (`https://ipwho.is/${ip}`) — sem isso, um header forjado poderia
 * injetar path na requisição que o servidor faz.
 */
export function isValidIp(ip: string): boolean {
  return IPV4.test(ip) || IPV6.test(ip);
}

/** Reconhece IPs de loopback e das faixas RFC 1918 (redes privadas). */
export function isLocalIp(ip: string): boolean {
  return (
    !ip ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.3')
  );
}
