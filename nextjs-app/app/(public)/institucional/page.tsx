import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { createClient } from '@/lib/supabase-server';
import './institucional.css';

export const revalidate = 60; // ISR - revalida a cada minuto para as páginas mudarem rápido após edição no painel

// Tags HTML permitidas no conteúdo institucional
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
  'a', 'strong', 'em', 'b', 'i',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'br', 'span', 'div', 'section',
  'details', 'summary'
];
const ALLOWED_ATTR = ['href', 'class', 'target', 'rel', 'id', 'aria-label', 'style', 'data-i18n'];

// Dicionário de SVGs (se cadastrado um nome diferente, pode usar um fallback)
const ICON_MAP: Record<string, React.ReactNode> = {
  'help': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  'mail': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  'alert-triangle': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  'file-text': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  'shield': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  'cookie': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="7.5" cy="9.5" r="1.5"/><circle cx="12.5" cy="6.5" r="1.5"/><circle cx="16.5" cy="11.5" r="1.5"/><circle cx="10.5" cy="14.5" r="1.5"/><path d="M22 12c-2.76 0-5 2.24-5 5s2.24 5 5 5"/></svg>,
  'info': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  'briefcase': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  'tv': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16h20"/><path d="M5 20h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>,
  'code': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  'file': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
};

export default async function InstitucionalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const pageParam = typeof params.page === 'string' ? params.page : 'sobre';

  const supabase = await createClient();
  const { data: pages } = await supabase.from('institutional_pages').select('*').order('order_idx', { ascending: true });
  
  if (!pages || pages.length === 0) {
    return <div style={{ padding: '100px', textAlign: 'center' }}>Nenhuma página institucional configurada.</div>;
  }

  const currentPageData = pages.find(p => p.id === pageParam);

  if (!currentPageData && pageParam !== pages[0].id) {
    redirect(`/institucional?page=${pages[0].id}`);
  }

  const activePage = currentPageData || pages[0];

  // Agrupar as páginas pelo group_name
  const groupedPages: Record<string, any[]> = {};
  pages.forEach(p => {
    if (!groupedPages[p.group_name]) groupedPages[p.group_name] = [];
    groupedPages[p.group_name].push(p);
  });

  // ─── Sanitização do HTML de conteúdo do banco ────────────────
  const safeData = activePage.content
    ? DOMPurify.sanitize(activePage.content, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ADD_ATTR: ['target'],
      })
    : null;

  const NavLink = ({ id, icon_name, label }: { id: string; icon_name: string; label: string }) => {
    const isActive = activePage.id === id;
    const icon = ICON_MAP[icon_name] || ICON_MAP['file'];
    return (
      <Link href={`/institucional?page=${id}`} className={`inst-nav-link ${isActive ? 'active' : ''}`}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <main style={{ minHeight: '80vh', paddingBottom: '4rem' }}>
      <div className="list-hero" style={{ marginTop: 'var(--header-h)' }}>
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <Link href="/">Início</Link>
                <span aria-hidden="true">›</span>
                <span>Institucional</span>
              </nav>
              <h1 className="list-hero-title">{activePage.title}</h1>
              <p className="list-hero-count">{activePage.subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="inst-layout">
          <aside className="inst-sidebar">
            {Object.keys(groupedPages).map(groupName => (
              <div className="inst-nav-group" key={groupName}>
                <div className="inst-nav-title">{groupName}</div>
                {groupedPages[groupName].map(p => (
                  <NavLink key={p.id} id={p.id} label={p.title} icon_name={p.icon_name} />
                ))}
              </div>
            ))}
          </aside>

          <div className="inst-content-box">
            {safeData ? (
              <div className="inst-prose" dangerouslySetInnerHTML={{ __html: safeData }} />
            ) : (
              <div className="inst-prose">
                <p>Nenhum conteúdo disponível para esta página.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
