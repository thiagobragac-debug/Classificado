import React from 'react';
import Link from 'next/link';
import content from './content.json';
import './institucional.css';

export const revalidate = 3600; // ISR

// 1. Convertido para Server Component (Zero Bundle Size de content.json no Client)
export default async function InstitucionalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams;
  const pageParam = typeof params.page === 'string' ? params.page : 'sobre';
  const currentPage = (content.templates as any)[pageParam] ? pageParam : 'sobre';

  const data = (content.templates as any)[currentPage];
  const titleInfo = (content.titles as any)[currentPage] || ['Página não encontrada', 'Erro 404'];

  const NavLink = ({ id, icon, label }: { id: string, icon: React.ReactNode, label: string }) => {
    const isActive = currentPage === id;
    return (
      <Link href={`/institucional?page=${id}`} className={`inst-nav-link ${isActive ? 'active' : ''}`} scroll={true}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <main style={{ marginTop: 'var(--header-h)', minHeight: '80vh', paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <Link href="/">Início</Link>
                <span aria-hidden="true">›</span>
                <span>Institucional</span>
              </nav>
              <h1 className="list-hero-title">{titleInfo[0]}</h1>
              <p className="list-hero-count">{titleInfo[1]}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="inst-layout">
          <aside className="inst-sidebar">
            <div className="inst-nav-group">
              <div className="inst-nav-title">Ajuda & Suporte</div>
              <NavLink id="ajuda" label="Central de Ajuda" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
              <NavLink id="contato" label="Fale Conosco" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>} />
              <NavLink id="denuncia" label="Denunciar Anúncio" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
            </div>

            <div className="inst-nav-group">
              <div className="inst-nav-title">Políticas</div>
              <NavLink id="termos" label="Termos de Uso" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} />
              <NavLink id="privacidade" label="Política de Privacidade" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>} />
              <NavLink id="cookies" label="Política de Cookies" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="7.5" cy="9.5" r="1.5"/><circle cx="12.5" cy="6.5" r="1.5"/><circle cx="16.5" cy="11.5" r="1.5"/><circle cx="10.5" cy="14.5" r="1.5"/><path d="M22 12c-2.76 0-5 2.24-5 5s2.24 5 5 5"/></svg>} />
            </div>

            <div className="inst-nav-group">
              <div className="inst-nav-title">A Empresa</div>
              <NavLink id="sobre" label="Sobre Nós" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>} />
              <NavLink id="trabalhe-conosco" label="Trabalhe Conosco" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
              <NavLink id="imprensa" label="Imprensa" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16h20"/><path d="M5 20h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>} />
              <NavLink id="api" label="API para Parceiros" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>} />
            </div>
          </aside>

          <div className="inst-content-box">
            {data ? (
              <div className="inst-prose" dangerouslySetInnerHTML={{ __html: data }} />
            ) : (
              <div className="inst-prose">
                <p>A página que você está procurando não existe ou foi movida.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
