export default function Loading() {
  return (
    <main>
      <section className="list-hero">
        <div className="container list-hero-inner">
          <div>
            <div className="breadcrumb">
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>...</span>
            </div>
            <h1 className="list-hero-title">Carregando anúncios...</h1>
          </div>
        </div>
      </section>
      <div className="container list-layout">
        <aside className="filter-sidebar">
          <div style={{ height: '300px', background: '#f8fafc', borderRadius: '12px' }}></div>
        </aside>
        <div className="list-main">
          <div className="ads-grid">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="sk-card" style={{ borderRadius: '12px', overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ height: '200px', background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }}></div>
                <div style={{ padding: '14px' }}>
                  <div style={{ height: '12px', borderRadius: '4px', marginBottom: '10px', width: '40%', background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }}></div>
                  <div style={{ height: '12px', borderRadius: '4px', marginBottom: '10px', width: '85%', background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }}></div>
                  <div style={{ height: '18px', borderRadius: '4px', width: '55%', background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
