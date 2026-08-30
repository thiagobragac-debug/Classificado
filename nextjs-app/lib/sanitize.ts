import DOMPurify from 'isomorphic-dompurify';

// BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): faltavam 'u'/'s' —
// a toolbar do editor de descrição de anúncio (RichTextEditor.tsx) expõe
// sublinhado e tachado, mas nenhuma das duas tags sobrevivia à sanitização
// (nem na escrita, nem na leitura pública em anuncio/[id]/page.tsx, que
// tinha sua PRÓPRIA allowlist divergente desta, sem 'a'/'u'/'s' — um link
// formatado pelo usuário era salvo corretamente e depois desaparecia na
// página pública). Unificado: esta é agora a única allowlist usada tanto na
// escrita (lib/supabase.ts, app/api/v1/ads/route.ts) quanto na leitura
// (anuncio/[id]/page.tsx) — uma allowlist divergente por ponto de leitura
// é exatamente o tipo de inconsistência que reabre XSS quando um novo
// consumidor do dado esquece de replicar a mais restritiva.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

// BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): antes desta rodada
// `<a>` nunca sobrevivia com atributos até a leitura pública (a página do
// anúncio usava ALLOWED_ATTR: []), então esse risco nunca se materializava.
// Agora que href/target/rel sobrevivem de verdade, um link com
// target="_blank" sem rel="noopener" permite que a página de destino acesse
// window.opener e redirecione a aba original (reverse tabnabbing) — DOMPurify
// já bloqueia por padrão o próprio esquema (javascript:) em href, mas não
// mexe em target/rel. Hook global: só age quando target="_blank" já está
// presente (não força a abrir em nova aba, só neutraliza o risco quando o
// autor do conteúdo já escolheu isso). Registrado uma vez no carregamento do
// módulo — DOMPurify.addHook é idempotente por instância de sanitizer, e
// isomorphic-dompurify reusa a mesma instância em todo o processo.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  });
}

export function sanitizeText(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Allowlist de protocolo pra href externo vindo do banco (link de evento,
// catálogo de leilão) — mesmo critério de components/Header.tsx::
// sanitizeLogoUrl e components/AdBanner.tsx, centralizado aqui pra não
// reimplementar blocklist bypassável (`startsWith('javascript')`) em cada
// novo campo de link que aparecer.
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
