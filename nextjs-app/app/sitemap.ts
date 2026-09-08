import { MetadataRoute } from 'next';
import { getAllSitemapEntries, SITEMAP_CHUNK_SIZE } from '@/lib/sitemap-data';

// BUG CORRIGIDO (auditoria de SEO, 2026-09-08): antes este arquivo montava
// TUDO (hoje 1.283 URLs) num array só, devolvido inteiro como /sitemap.xml.
// Funciona bem abaixo do limite do Google (50.000 URLs OU 50MB por arquivo),
// mas nada aqui paginava — um catálogo bem maior no futuro estouraria esse
// limite silenciosamente. generateSitemaps() decide QUANTOS arquivos existem
// agora (calculado a partir do total real, não um número fixo), e a função
// default abaixo devolve só a fatia pedida — infraestrutura testada agora
// (com poucos dados, fácil de comparar antes/depois) em vez de description
// deixada pra quando o catálogo já estiver grande e sob pressão.
//
// IMPORTANTE (versão do Next — ver node_modules/next/dist/docs/.../
// generate-sitemaps.md desta versão, 16.3.2): a partir da v16, o `id`
// chega pra função default como Promise<string>, não number direto como em
// versões anteriores/exemplos antigos — daí o `await` abaixo antes de
// converter com Number(). generateSitemaps() continua devolvendo números
// puros ({id: 0}, {id: 1}, ...); é só a função default que recebe
// diferente.
//
// URLs resultantes: /sitemap/0.xml, /sitemap/1.xml, etc. (não mais
// /sitemap.xml sozinho) — app/robots.ts lista cada um dinamicamente.
export const revalidate = 3600;

export async function generateSitemaps() {
  const all = await getAllSitemapEntries();
  const numSitemaps = Math.max(1, Math.ceil(all.length / SITEMAP_CHUNK_SIZE));
  return Array.from({ length: numSitemaps }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const idx = Number(await id);
  const all = await getAllSitemapEntries();
  return all.slice(idx * SITEMAP_CHUNK_SIZE, (idx + 1) * SITEMAP_CHUNK_SIZE);
}
