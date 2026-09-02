import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tauzeclass.com.br';

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
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
