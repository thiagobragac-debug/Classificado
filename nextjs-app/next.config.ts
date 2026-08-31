import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './lib/security-headers';

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // BUG CORRIGIDO (auditoria de SEO, 2ª rodada): sem `formats`, o Next só
    // gera WebP — AVIF costuma ficar 20-30% menor que WebP no mesmo
    // conteúdo (fotos de anúncio, JPEGs reais), o que ajuda LCP/CWV.
    // Ordem importa: o Next serve o primeiro formato da lista que o
    // navegador do visitante aceitar (Accept header), então AVIF primeiro
    // com WebP como fallback pros navegadores mais antigos.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rfzuzuobwuanmbrcthqe.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
  },
  async headers() {
    return [
      {
        // Baseline para todos os paths, inclusive os assets estáticos que o
        // matcher do proxy exclui. O Content-Security-Policy dinâmico (com
        // nonce por requisição) é aplicado por cima pelo proxy.ts.
        source: '/(.*)',
        headers: [...SECURITY_HEADERS],
      },

      {
        // Cache para arquivos de mídia públicos
        source: '/assets/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
  // NOTA: o redirect do antigo ?lang=pt|es em /anuncio e /vendedor foi
  // tentado aqui via `redirects()` + `has: [{ type: 'query', ... }]`, mas o
  // Next.js repassa a querystring ORIGINAL pro destino por padrão quando ela
  // não é capturada nomeadamente — o resultado prático era um redirect que
  // chegava no lugar certo, mas com "?lang=es" ainda pendurado na URL final
  // (confirmado ao vivo). Sem uma forma limpa de descartar só esse
  // parâmetro específico nesta API, a lógica foi movida pra proxy.ts (que já
  // roda em toda requisição e pode construir a URL de destino removendo o
  // parâmetro de propósito) — ver bloco "Redirect do antigo ?lang=" ali.
};

export default nextConfig;
