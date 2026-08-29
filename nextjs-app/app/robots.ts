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
      disallow: ['/painel/', '/admin/', '/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
