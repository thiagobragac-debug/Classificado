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
 *
 * BUG CORRIGIDO (validação adversarial final): retornava o literal
 * '127.0.0.1' quando nenhum header confiável existia. Usado como chave de
 * bucket de rate limit (`login_${ip}`, `contact_form_${ip}`), isso colapsava
 * TODO cliente sem esses headers (dev local, ou produção atrás de um proxy
 * que não os define) num único balde compartilhado — um cliente agressivo
 * esgotava o limite de todo mundo nessa situação. Devolve `null` para o
 * chamador decidir: rotas de rate limit devem tratar como "não dá pra saber
 * o IP" e não aplicar o limite (mesma filosofia de falha aberta já usada
 * quando o banco do rate limit está indisponível, ver proxy.ts), em vez de
 * inventar um identificador compartilhado.
 */
export function resolverIpConfiavel(headers: HeaderLike): string | null {
  const vercel = headers.get('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel.split(',').pop()!.trim();

  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;

  const encaminhado = headers.get('x-forwarded-for');
  if (encaminhado) {
    const ultimo = encaminhado.split(',').pop()?.trim();
    if (ultimo) return ultimo;
  }

  return null;
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
export function isValidIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return IPV4.test(ip) || IPV6.test(ip);
}

/**
 * Normaliza um IP para uso como CHAVE DE RATE LIMIT — não usar pra exibição
 * ou auditoria (essas querem o endereço completo), só pra decidir "é
 * plausivelmente o mesmo cliente?".
 *
 * BUG CORRIGIDO (validação adversarial final): limitar por endereço IPv6
 * completo é ineficaz na prática. Provedores residenciais/móveis tipicamente
 * alocam um /64 inteiro (às vezes /56) por cliente — o navegador já
 * rotaciona o sufixo periodicamente por padrão (privacy extensions, RFC
 * 4941), e um script malicioso pode forçar uma rotação a CADA requisição,
 * gerando um número praticamente infinito de "IPs" distintos a partir de
 * uma única conexão doméstica, sem nunca repetir o balde de rate limit.
 * IPv4 não tem esse problema na mesma escala (o endereço inteiro já É a
 * granularidade do cliente) — passa direto. Trunca IPv6 no prefixo /64
 * (os 4 primeiros grupos, já expandindo a notação `::`), que é o que
 * realmente identifica a conexão/cliente.
 */
export function ipParaRateLimit(ip: string): string {
  if (!ip.includes(':')) return ip; // IPv4 (ou algo não reconhecido) — usa como está

  let grupos: string[];
  if (ip.includes('::')) {
    const [cabeca, cauda] = ip.split('::');
    const gruposCabeca = cabeca ? cabeca.split(':') : [];
    const gruposCauda = cauda ? cauda.split(':') : [];
    const faltando = 8 - gruposCabeca.length - gruposCauda.length;
    if (faltando < 0) return ip; // formato inesperado — não trunca às cegas
    grupos = [...gruposCabeca, ...Array(faltando).fill('0'), ...gruposCauda];
  } else {
    grupos = ip.split(':');
    if (grupos.length !== 8) return ip; // formato inesperado
  }

  return `${grupos.slice(0, 4).join(':')}::/64`;
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
