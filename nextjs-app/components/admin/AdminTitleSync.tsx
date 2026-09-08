'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// BUG CORRIGIDO (auditoria de SEO, 2026-09-08): as 19 páginas de /admin/*
// são todas 'use client' (não podem exportar generateMetadata/metadata) e
// herdavam o único <title> estático do layout ("Admin - Tauze Class") — com
// várias abas abertas (ex: Usuários e Leilões) era impossível distinguir
// qual é qual. Sem efeito em SEO (/admin já é noindex,nofollow em
// app/(admin)/layout.tsx), só usabilidade de quem administra o site. Um
// componente só aqui no layout (em vez de editar as 19 páginas uma a uma)
// cobre a árvore inteira via usePathname().
const SECTION_LABELS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/anuncios': 'Anúncios',
  '/admin/leiloes': 'Leilões',
  '/admin/usuarios': 'Usuários',
  '/admin/denuncias': 'Denúncias',
  '/admin/mensagens-contato': 'Mensagens',
  '/admin/verificacoes': 'Verificações',
  '/admin/banners': 'Banners',
  '/admin/planos': 'Planos',
  '/admin/categorias': 'Categorias',
  '/admin/subcategorias': 'Subcategorias',
  '/admin/cupons': 'Cupons',
  '/admin/assinaturas': 'Assinaturas',
  '/admin/api-keys': 'Chaves API',
  '/admin/configuracoes': 'Configurações',
  '/admin/paginas': 'Páginas Institucionais',
  '/admin/depoimentos': 'Depoimentos',
};

function labelFor(pathname: string): string {
  if (SECTION_LABELS[pathname]) return SECTION_LABELS[pathname];
  // Sub-rota (ex: /admin/leiloes/abc123) — usa a seção pai mais específica.
  const match = Object.keys(SECTION_LABELS)
    .filter((p) => p !== '/admin' && pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SECTION_LABELS[match] : 'Dashboard';
}

export default function AdminTitleSync() {
  const pathname = usePathname();
  useEffect(() => {
    document.title = `${labelFor(pathname)} - Admin | Tauze Class`;
  }, [pathname]);
  return null;
}
