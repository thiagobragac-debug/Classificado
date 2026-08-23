import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './lib/security-headers';

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
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
};

export default nextConfig;
