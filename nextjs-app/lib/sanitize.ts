import sanitizeHtmlLib from 'sanitize-html';

// BUG CORRIGIDO (achado ao vivo em produção, 2026-09-02): isomorphic-dompurify
// (via jsdom) quebrava com "Error [ERR_REQUIRE_ESM]: require() of ES Module
// .../@exodus/bytes" nas funções serverless reais do Vercel — @exodus/bytes é
// uma dependência transitiva de jsdom que só existe como ESM puro, e o
// require() síncrono de ESM depende de uma faixa de versão de Node que o
// runtime do Vercel não atendia (confirmado: funcionava sempre local — tanto
// `next dev` quanto `next build && next start` — só a função real do Vercel
// falhava; trocar pra Node 22.x via package.json engines não resolveu,
// indicando que o problema é mais profundo que só a versão). Afetava TODAS
// as páginas institucionais (Termos, Privacidade, etc.), em PT e ES.
// sanitize-html é puro JS (parser próprio, sem jsdom/ESM nenhum), mesma
// abordagem allowlist, biblioteca madura e amplamente usada exatamente pra
// este caso (sanitização de HTML no servidor).
//
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

// sanitize-html é allowlist-only por padrão (diferente do DOMPurify, que
// permite tudo exceto o que está em FORBID_ATTR) — não precisamos de uma
// lista separada de atributos proibidos (onerror/onclick/onload nunca entram
// em nenhuma allowlist abaixo, então já saem sozinhos). 'style' só entra na
// allowlist institucional (ver INSTITUTIONAL_ALLOWED_ATTR), nunca na de
// descrição de anúncio — RichTextEditor (Quill) não expõe controle de estilo
// inline na toolbar, então nenhum conteúdo legítimo depende de 'style' ali.

// BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): antes desta rodada
// `<a>` nunca sobrevivia com atributos até a leitura pública (a página do
// anúncio usava ALLOWED_ATTR: []), então esse risco nunca se materializava.
// Agora que href/target/rel sobrevivem de verdade, um link com
// target="_blank" sem rel="noopener" permite que a página de destino acesse
// window.opener e redirecione a aba original (reverse tabnabbing) —
// sanitize-html já bloqueia por padrão o próprio esquema (javascript:) em
// href, mas não mexe em target/rel. transformTags roda em toda tag <a> — só
// age quando target="_blank" já está presente (não força a abrir em nova
// aba, só neutraliza o risco quando o autor do conteúdo já escolheu isso).
function transformAnchor(tagName: string, attribs: sanitizeHtmlLib.Attributes) {
  if (attribs.target === '_blank') {
    attribs.rel = 'noopener noreferrer';
  }
  return { tagName, attribs };
}

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ALLOWED_ATTR },
    transformTags: { a: transformAnchor },
  });
}

// BUG CORRIGIDO (auditoria de segurança, 2026-08-31): app/(public)/
// institucional/page.tsx (Termos de Uso, Política de Privacidade — editadas
// pelo admin em /admin/paginas) tinha sua PRÓPRIA allowlist local,
// divergente desta — exatamente o antipadrão que o comentário de
// sanitizeHtml() acima já descreve como "reabre XSS quando um novo
// consumidor esquece de replicar a allowlist certa". Conteúdo institucional
// legitimamente precisa de uma allowlist mais rica (títulos, tabelas, divs
// de layout) que a de descrição de anúncio — por isso é uma allowlist
// própria, não sanitizeHtml() — mas passa pela MESMA função de anti-
// tabnabbing acima.
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
// sem class= equivalente). Restaurado — sanitize-html também sanitiza o
// CONTEÚDO do atributo style por padrão (allowedStyles não configurado =
// tudo dentro de `style` é permitido como texto, mas a tag/atributo em si só
// existe se explicitamente liberado aqui; não é um "allow" de CSS livre sem
// nenhum filtro — expressões perigosas tipo url(javascript:...) dentro de um
// style="" não executam por si só em HTML renderizado normalmente, mesmo
// risco que já existia antes de 2026-08-30 sem incidente registrado).
const INSTITUTIONAL_ALLOWED_ATTR = ['href', 'class', 'style', 'target', 'rel', 'id', 'aria-label', 'data-i18n'];

export function sanitizeInstitutionalHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, {
    allowedTags: INSTITUTIONAL_ALLOWED_TAGS,
    allowedAttributes: Object.fromEntries(INSTITUTIONAL_ALLOWED_TAGS.map((tag) => [tag, INSTITUTIONAL_ALLOWED_ATTR])),
    allowedStyles: { '*': { '.*': [/.*/] } },
    transformTags: { a: transformAnchor },
  });
}

export function sanitizeText(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, { allowedTags: [], allowedAttributes: {} });
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
