'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import content from './content.json'
import './institucional.css'

function InstitucionalContent() {
  const searchParams = useSearchParams()
  const pageParam = searchParams.get('page') || 'sobre'
  const [currentPage, setCurrentPage] = useState(pageParam)
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    setCurrentPage(searchParams.get('page') || 'sobre')
  }, [searchParams])

  const handleNavClick = (pageId: string) => {
    setIsFading(true)
    setTimeout(() => {
      window.history.pushState(null, '', `?page=${pageId}`)
      setCurrentPage(pageId)
      setIsFading(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 250)
  }

  const data = (content.templates as any)[currentPage]
  const titleInfo = (content.titles as any)[currentPage] || ['Página não encontrada', 'Erro 404']

  return (
    <main style={{ marginTop: 'var(--header-h)', minHeight: '80vh', paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <a href="/">Início</a>
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
              <a className={`inst-nav-link ${currentPage === 'ajuda' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('ajuda') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Central de Ajuda</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'contato' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('contato') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span>Fale Conosco</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'denuncia' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('denuncia') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Denunciar Anúncio</span>
              </a>
            </div>

            <div className="inst-nav-group">
              <div className="inst-nav-title">Políticas</div>
              <a className={`inst-nav-link ${currentPage === 'termos' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('termos') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Termos de Uso</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'privacidade' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('privacidade') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Política de Privacidade</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'cookies' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('cookies') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="7.5" cy="9.5" r="1.5"/><circle cx="12.5" cy="6.5" r="1.5"/><circle cx="16.5" cy="11.5" r="1.5"/><circle cx="10.5" cy="14.5" r="1.5"/><path d="M22 12c-2.76 0-5 2.24-5 5s2.24 5 5 5"/></svg>
                <span>Política de Cookies</span>
              </a>
            </div>

            <div className="inst-nav-group">
              <div className="inst-nav-title">A Empresa</div>
              <a className={`inst-nav-link ${currentPage === 'sobre' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('sobre') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Sobre Nós</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'trabalhe-conosco' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('trabalhe-conosco') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>Trabalhe Conosco</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'imprensa' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('imprensa') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16h20"/><path d="M5 20h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>
                <span>Imprensa</span>
              </a>
              <a className={`inst-nav-link ${currentPage === 'api' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); handleNavClick('api') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <span>API para Parceiros</span>
              </a>
            </div>
          </aside>

          <div className={`inst-content-box ${isFading ? 'fading' : ''}`}>
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
  )
}

export default function InstitucionalPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '10vh' }}>Carregando Portal Legal...</div>}>
      <InstitucionalContent />
    </Suspense>
  )
}
