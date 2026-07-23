export default function Loading() {
  return (
    <div className="container" style={{ paddingTop: 'calc(var(--header-h) + 3rem)', paddingBottom: '4rem' }}>
      <div className="product-grid anuncio-skeleton" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
        <div className="product-gallery-area" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Main image skeleton */}
          <div className="skel-gallery" style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--clr-surface-alt)', borderRadius: '1rem', animation: 'pulse 1.5s infinite' }} />
          
          {/* Thumbs skeleton */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ width: 80, height: 80, background: 'var(--clr-surface-alt)', borderRadius: '0.8rem', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>

          {/* Description skeleton */}
          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skel-line" style={{ width: '60%', height: 24, background: 'var(--clr-surface-alt)', borderRadius: '0.25rem', animation: 'pulse 1.5s infinite' }} />
            <div className="skel-line" style={{ width: '100%', height: 12, background: 'var(--clr-surface-alt)', borderRadius: '0.25rem', animation: 'pulse 1.5s infinite' }} />
            <div className="skel-line" style={{ width: '90%', height: 12, background: 'var(--clr-surface-alt)', borderRadius: '0.25rem', animation: 'pulse 1.5s infinite' }} />
            <div className="skel-line" style={{ width: '75%', height: 12, background: 'var(--clr-surface-alt)', borderRadius: '0.25rem', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        
        {/* Sidebar skeleton */}
        <div className="skel-panel" style={{ width: '100%', height: '500px', background: 'var(--clr-surface-alt)', borderRadius: '1rem', animation: 'pulse 1.5s infinite' }} />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        @media (max-width: 991px) {
          .anuncio-skeleton {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />
    </div>
  );
}
