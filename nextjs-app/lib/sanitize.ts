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

// Compartilhado por sanitizeHtml() e sanitizeInstitutionalHtml() — sem isto,
// cada allowlist precisaria repetir a mesma lista de atributos perigosos.
// 'style' NÃO entra aqui (ver FORBID_ATTR_HTML abaixo) — sanitizeHtml()
// (descrição de anúncio) proíbe; sanitizeInstitutionalHtml() precisa
// permitir (ver comentário na função).
const FORBID_ATTR = ['onerror', 'onload', 'onclick'];
// Descrição de anúncio: RichTextEditor (Quill) não expõe controle de estilo
// inline na toolbar, então nenhum conteúdo legítimo depende de 'style' aqui
// — mantém proibido, ao contrário do conteúdo institucional.
const FORBID_ATTR_HTML = [...FORBID_ATTR, 'style'];

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
    FORBID_ATTR: FORBID_ATTR_HTML,
  });
}

// BUG CORRIGIDO (auditoria de segurança, 2026-08-31): app/(public)/
// institucional/page.tsx (Termos de Uso, Política de Privacidade — editadas
// pelo admin em /admin/paginas) tinha sua PRÓPRIA allowlist DOMPurify local,
// divergente desta — exatamente o antipadrão que o comentário de
// sanitizeHtml() acima já descreve como "reabre XSS quando um novo
// consumidor esquece de replicar a allowlist certa". Como resultado, o hook
// global de anti-tabnabbing (afterSanitizeAttributes acima) só era
// registrado quando este módulo era importado — a página institucional
// nunca importava, então `rel="noopener noreferrer"` não era garantido ali.
// Conteúdo institucional legitimamente precisa de uma allowlist mais rica
// (títulos, tabelas, divs de layout) que a de descrição de anúncio — por
// isso é uma allowlist própria, não sanitizeHtml() — mas passa pela MESMA
// instância de DOMPurify (com o hook já registrado) e pelo mesmo FORBID_ATTR.
const INSTITUTIONAL_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
  'a', 'strong', 'em', 'b', 'i',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'br', 'span', 'div', 'section',
  'details', 'summary',
];
// BUG CORRIGIDO (teste de estresse full-system, 2026-08-31): a unificação
// acima (mesma rodada) tinha herdado 'style' removido de ALLOWED_ATTR, com o
// comentário "nenhum conteúdo legítimo depende disso" — falso pro conteúdo
// REAL das 10 páginas institucionais em produção: confirmado lendo
// institutional_pages.content/content_es que todas usam style= pra
// estrutura visual real (ex.: boxes de alerta vermelho/âmbar em "Termos",
// sem class= equivalente). Restaurado — DOMPurify já sanitiza o CONTEÚDO do
// atributo style (remove expression()/url(javascript:)/behavior etc.), não
// é um allow cru; o risco residual (CSS legítimo mal-intencionado, ex.
// position:fixed cobrindo a tela) já existia antes de 2026-08-30 sem
// incidente registrado.
const INSTITUTIONAL_ALLOWED_ATTR = ['href', 'class', 'style', 'target', 'rel', 'id', 'aria-label', 'data-i18n'];

export function sanitizeInstitutionalHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: INSTITUTIONAL_ALLOWED_TAGS,
    ALLOWED_ATTR: INSTITUTIONAL_ALLOWED_ATTR,
    FORBID_ATTR,
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
