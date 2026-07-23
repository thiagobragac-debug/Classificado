import React from 'react';

export default function LoadingVendedor() {
  return (
    <main className="flex-1 flex flex-col" style={{ marginTop: 'var(--header-h)' }}>
      {/* Hero Skeleton */}
      <div className="list-hero" style={{ paddingBottom: '80px' }}>
        <div className="container">
          <div className="list-hero-inner">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: 0.5 }}>
              <div style={{ width: '150px', height: '16px', background: '#cbd5e1', borderRadius: '4px' }} className="animate-pulse" />
              <div style={{ width: '300px', height: '40px', background: '#cbd5e1', borderRadius: '8px', marginTop: '1rem' }} className="animate-pulse" />
              <div style={{ width: '250px', height: '20px', background: '#cbd5e1', borderRadius: '4px' }} className="animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Profile Header Skeleton */}
      <div style={{ marginTop: '-80px', position: 'relative', zIndex: 10 }}>
        <div className="container" style={{ marginTop: '2rem' }}>
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            flexWrap: 'wrap'
          }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#e2e8f0' }} className="animate-pulse" />
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '200px', height: '28px', background: '#e2e8f0', borderRadius: '6px' }} className="animate-pulse" />
                <div style={{ width: '80px', height: '24px', background: '#e2e8f0', borderRadius: '99px' }} className="animate-pulse" />
              </div>
              <div style={{ width: '150px', height: '20px', background: '#e2e8f0', borderRadius: '4px' }} className="animate-pulse" />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '120px', height: '44px', background: '#f1f5f9', borderRadius: '12px' }} className="animate-pulse" />
              <div style={{ width: '160px', height: '44px', background: '#e2e8f0', borderRadius: '12px' }} className="animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Ads Grid Skeleton */}
      <div className="container" style={{ marginTop: '2rem', marginBottom: '4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <div style={{ height: '200px', background: '#f1f5f9' }} className="animate-pulse" />
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '24px', width: '80%', background: '#f1f5f9', borderRadius: '4px' }} className="animate-pulse" />
                <div style={{ height: '16px', width: '60%', background: '#f1f5f9', borderRadius: '4px' }} className="animate-pulse" />
                <div style={{ height: '28px', width: '40%', background: '#e2e8f0', borderRadius: '6px', marginTop: '8px' }} className="animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
