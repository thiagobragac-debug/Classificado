import React from 'react';

export default function AdsSkeleton() {
  return (
    <div 
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-4)' }}
      aria-busy="true"
      role="status"
      aria-label="Carregando anúncios..."
    >
      {[...Array(12)].map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', background: 'white', padding: 'var(--sp-4)', borderRadius: 'var(--r-lg)', border: '1px solid var(--clr-border)' }}>
          <div className="skeleton" style={{ width: '100%', height: '180px', borderRadius: 'var(--r-md)' }}></div>
          <div className="skeleton" style={{ width: '80%', height: '24px', borderRadius: '4px', marginTop: 'var(--sp-2)' }}></div>
          <div className="skeleton" style={{ width: '50%', height: '16px', borderRadius: '4px', marginBottom: 'var(--sp-4)' }}></div>
          <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: 'var(--r-md)', marginTop: 'auto' }}></div>
        </div>
      ))}
    </div>
  );
}
