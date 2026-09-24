import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './lib/security-headers';

const nextConfig: NextConfig = {
  // BUG CORRIGIDO (achado ao vivo, auditoria de lentidão 2026-09-24): sem
  // isso, `next start` no Render depende da árvore completa de
  // node_modules pra subir — no self-hosted (diferente da Vercel, que já
  // roda algo equivalente internamente), 'standalone' gera um server.js
  // mínimo que inicializa mais rápido. Reduz diretamente a janela de
  // cold-start (~50s+) a cada hibernação do Free Tier. Exige trocar o Start
  // Command no Render pra `node .next/standalone/server.js`.
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Necessário porque este projeto NÃO tem um app/layout.tsx compartilhado
    // -- app/(public)/layout.tsx e app/(admin)/layout.tsx cada um define seu
    // próprio <html>/<body> (múltiplos root layouts). Nesse cenário, um
    // app/not-found.tsx comum na raiz não cobre URLs totalmente fora de
    // qualquer rota (só cobre notFound() chamado dentro de uma rota já
    // resolvida) -- ver node_modules/next/dist/docs/01-app/03-api-reference/
    // 03-file-conventions/not-found.md, seção "global-not-found.js". Esta
    // flag habilita app/global-not-found.tsx para esse caso.
    globalNotFound: true,
  },
  images: {
    // BUG CORRIGIDO (achado ao vivo, auditoria de lentidão 2026-09-24):
    // AVIF tirado da lista. Na Vercel a otimização de imagem roda numa
    // function separada da instância de SSR; aqui (Render self-hosted) o
    // Next processa via sharp DENTRO do mesmo processo pequeno (Free Tier =
    // CPU compartilhada) que atende todo o SSR — e AVIF é sensivelmente
    // mais caro de codificar que WebP. Fica só WebP (ainda bem mais leve
    // que JPEG/PNG cru, ver components/AppImage.tsx) até o processo de
    // otimização sair do processo Node (Supabase Image Transformations, já
    // preparado em AppImage.tsx, pendente de upgrade de plano do Storage).
    formats: ['image/webp'],
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
      // BUG CORRIGIDO: via.placeholder.com nunca foi usado em lugar nenhum do
      // código — o placeholder real (fallback de imagem em telas de admin,
      // ver lib/storage.ts) é placehold.co, já liberado na CSP (proxy.ts
      // img-src) mas ausente aqui. As duas listas precisam concordar.
      { protocol: 'https', hostname: 'placehold.co' },
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
