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
      // BUG CORRIGIDO (revisão pós-merge da migração de i18n): o protocolo
      // de exclusão de robôs casa por PREFIXO LITERAL do path — '/painel/'
      // não cobre '/es/painel/'. Hoje nenhum link real do site gera esses
      // paths sob /es (proxy.ts exclui explicitamente /painel e /admin do
      // redirect de locale, e nada no app constrói esse href), então o
      // risco prático é baixo — mas é defesa em profundidade barata contra
      // qualquer link futuro que vaze pra lá (ex.: um usuário colando uma
      // URL de recuperação de senha com o prefixo errado).
      disallow: ['/painel/', '/admin/', '/api/', '/es/painel/', '/es/admin/', '/es/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
