// BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS
// pedida pelo usuário, 2026-09-24): as rotas de mutação do admin
// (app/api/admin/**) autenticavam só via cookie de sessão + is_admin, sem
// nenhuma checagem de Origin/Referer — diferente de app/api/contact-seller
// e app/api/contact, que já validam Origin contra uma allowlist como
// proteção CSRF explícita. O risco prático já era reduzido (cookie de
// sessão do Supabase usa sameSite: 'lax' por padrão, sem override em todo o
// repo — bloqueia o cookie num POST cross-site clássico via <form>), mas é
// uma camada de defesa a menos exatamente nas ações mais privilegiadas do
// sistema (convidar e-mail arbitrário, bloquear/desbloquear usuário,
// aprovar/rejeitar KYC, cancelar assinatura de qualquer usuário, alterar
// chaves de gateway de pagamento). Extraído aqui (mesmo padrão já usado em
// lib/sanitize.ts/lib/ip-utils.ts) em vez de copiar a allowlist em cada
// rota — evita a mesma classe de divergência silenciosa que motivou essas
// outras extrações.
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  'https://www.tauzeclass.com.br',
  'https://tauzeclass.com.br',
  'http://localhost:3000',
].filter(Boolean) as string[];

/**
 * Bloqueia a requisição (retorna true) se o header Origin estiver presente
 * e não bater com a allowlist. Ausência de Origin não é bloqueada de
 * propósito (clientes non-browser legítimos — cron interno, curl de teste
 * manual do próprio admin — não mandam esse header; a defesa real contra
 * CSRF de browser é justamente exigir bater com a allowlist QUANDO o
 * browser manda o header, que ele sempre manda em POST cross-origin).
 */
export function isForbiddenOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && !ALLOWED_ORIGINS.includes(origin);
}
