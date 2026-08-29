// Escapa um objeto JSON-LD antes de injetá-lo via dangerouslySetInnerHTML em
// <script type="application/ld+json">. Escapa <, > e & (não só '<') pra
// impedir fechamento prematuro da tag <script> e sequências como "]]>" ou
// "&lt;" sendo interpretadas fora de contexto pelo parser HTML.
export function escapeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
