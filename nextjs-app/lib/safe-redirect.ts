// BUG CORRIGIDO (varredura cruzada de cenários, achado de segurança): a
// checagem anterior só rejeitava valores começando com "//" — mas
// "/\evil.com" também começa com uma única barra e o navegador resolve
// isso como URL relativa-a-esquema (protocol-relative), mandando o usuário
// pra um domínio externo logo após o login. new URL(...).origin compara a
// origem de verdade, sem depender de heurística de prefixo de string.
//
// Extraído de LoginForm.tsx (app Android/iOS, ver components/
// CapacitorAuthBridge.tsx) — mesma sanitização precisa valer tanto pro
// pós-login normal quanto pro retorno do OAuth do Google dentro do app
// nativo, sem duplicar a lógica de segurança em dois lugares.
export function getSafeRedirect(raw: string | null, fallback = '/painel'): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) {
      return url.pathname + url.search + url.hash;
    }
  } catch { /* raw inválido, cai no fallback */ }
  return fallback;
}
