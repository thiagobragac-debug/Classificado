'use client';

import { useState } from 'react';
import { LotData } from './LotBiddingModal';
import LotBiddingModal from './LotBiddingModal';

interface LotGridProps {
  lots: LotData[];
  isLive: boolean;
  userId?: string;
}

export default function LotGrid({ lots, isLive, userId }: LotGridProps) {
  const [selectedLot, setSelectedLot] = useState<LotData | null>(null);

  if (!lots || lots.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--clr-text-light)' }}>
        Nenhum lote cadastrado para este leilão.
      </div>
    );
  }

  return (
    <>
      <div className="ads-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginTop: '2rem' }}>
        {lots.map(lot => {
          const currentBid = lot.current_bid || lot.min_bid || 0;
          const imgFilter = !isLive ? 'grayscale(80%) opacity(0.85)' : 'none';

          return (
            <article key={lot.id} className="ad-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="ad-card__image" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#020617', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, zIndex: 10 }}>
                  LOTE {lot.lot_number}
                </div>
                <img 
                  src={lot.image || 'https://via.placeholder.com/400x300?text=Sem+Foto'} 
                  alt={lot.title} 
                  style={{ width: '100%', height: '200px', objectFit: 'cover', filter: imgFilter }} 
                />
              </div>
              
              <div className="ad-card__body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
                <h3 className="ad-card__title" style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: 1.3 }}>
                  {lot.title}
                </h3>
                
                <div style={{ background: 'var(--clr-bg-alt)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-light)', marginBottom: '0.2rem' }}>
                    {isLive ? 'LANCE ATUAL' : 'LANCE INICIAL'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#22c55e' }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentBid)}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button 
                    onClick={() => setSelectedLot(lot)}
                    className="btn btn--accent" 
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {isLive ? 'Dar Lance' : 'Ver Lote'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedLot && (
        <LotBiddingModal 
          lot={selectedLot} 
          userId={userId} 
          onClose={() => setSelectedLot(null)} 
        />
      )}
    </>
  );
}
