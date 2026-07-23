import React from 'react'
import styles from './page.module.css'

export default function Loading() {
  return (
    <main style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <span>Início</span>
                <span aria-hidden="true">›</span>
                <span>Agenda de Eventos</span>
              </nav>
              <h1 className="list-hero-title">Agenda de Eventos</h1>
              <p className="list-hero-count">Encontre feiras, exposições e congressos do Agronegócio.</p>
            </div>
            
            <div className="hero-search-box" style={{ margin: 0, transform: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '420px', height: '56px' }}>
              {/* Skeleton Search */}
              <div className={styles.skeleton} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
        <div className="events-section">
          <h2 className="section-title">Grandes Destaques Nacionais</h2>
          
          <div className="events-grid">
            {/* Render 6 skeleton cards */}
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="event-card" style={{ padding: 0 }}>
                <div className={`${styles.skeleton} ${styles.skeletonImage}`} />
                <div style={{ paddingBottom: '1.5rem' }}>
                  <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonText}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
