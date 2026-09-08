import { MetadataRoute } from 'next';
import { getAllSitemapEntries, SITEMAP_CHUNK_SIZE } from '@/lib/sitemap-data';

// BUG CORRIGIDO (auditoria de SEO, 2026-09-08): app/sitemap.ts passou a usar
// generateSitemaps() (particiona em /sitemap/0.xml, /sitemap/1.xml, etc. —
// ver comentário lá) — o /sitemap.xml único de antes não existe mais, então
// listar só ele aqui como "Sitemap:" apontaria pra uma URL que não serve
// conteúdo válido. Recalcula quantos arquivos existem AGORA (mesma função,
// mesmo Data Cache de 1h que sitemap.ts já usa — não dobra o custo real) e
// lista cada um. Isso obriga esta rota a virar async e ganhar seu próprio
// revalidate, já que antes era uma função síncrona sem nenhuma leitura de
// banco.
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tauzeclass.com.br';
  const all = await getAllSitemapEntries();
  const numSitemaps = Math.max(1, Math.ceil(all.length / SITEMAP_CHUNK_SIZE));
  const sitemaps = Array.from({ length: numSitemaps }, (_, id) => `${baseUrl}/sitemap/${id}.xml`);

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // '/_next/' NÃO entra no disallow: bloquear esse caminho impede o
      // Google de baixar JS/CSS usados para renderizar client components,
      // o que prejudica a avaliação de páginas que dependem de hidratação.
      //
      // BUG CORRIGIDO (auditoria de SEO): '/painel/' e '/admin/' SAÍRAM do
      // disallow — a própria documentação do Google recomenda NUNCA usar
      // robots.txt para impedir indexação (só serve para poupar crawl
      // budget). Bloquear via Disallow impede o Googlebot de sequer
      // acessar a página e enxergar a meta noindex que ela já declara
      // (toda rota sob /painel e /admin retorna `robots: {index: false,
      // follow: false}` — ver app/(public)/painel/page.tsx,
      // app/(admin)/layout.tsx etc.) — o resultado prático da combinação
      // Disallow+noindex é o Google poder indexar a URL nua (sem snippet,
      // "descrição não disponível por causa do robots.txt") caso algum link
      // externo aponte pra lá, exatamente o cenário que o noindex sozinho
      // evitaria. Sem o Disallow, a meta noindex passa a ser a única (e
      // suficiente) fonte de verdade. '/api/' continua bloqueado: são
      // endpoints, não páginas HTML com meta tag nenhuma, então aqui
      // Disallow só economiza crawl budget sem conflitar com nada.
      disallow: ['/api/', '/es/api/'],
    },
    sitemap: sitemaps,
  };
}
