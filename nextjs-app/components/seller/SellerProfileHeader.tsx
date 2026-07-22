'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import ReviewModal from './ReviewModal';

export default function SellerProfileHeader({ sellerId }: { sellerId: string }) {
  const [name, setName] = useState('Carregando...');
  const [ratingText, setRatingText] = useState('(0 avaliações)');
  const [starsHtml, setStarsHtml] = useState('☆☆☆☆☆');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!sellerId) {
        setName('Vendedor não encontrado');
        return;
      }
      const sb = getSupabase();
      
      const { data: profile } = await sb.from('profiles').select('name, display_name').eq('id', sellerId).single();
      const loadedName = profile?.display_name || profile?.name || 'Vendedor Anônimo';
      setName(loadedName);

      const { data: stats } = await sb.rpc('get_seller_stats', { p_seller_id: sellerId });
      if (stats && stats.length > 0 && stats[0].total_reviews > 0) {
        const total = stats[0].total_reviews;
        const avg = stats[0].avg_rating;
        setRatingText(`(${total} avaliação${total > 1 ? 'ões' : ''}) • Média ${avg.toFixed(1)}`);
        
        let stars = '';
        for (let i = 1; i <= 5; i++) {
          stars += (i <= Math.round(avg)) ? '★' : '☆';
        }
        setStarsHtml(stars);
      } else {
        setRatingText('(Nenhuma avaliação ainda)');
      }
    };
    loadProfile();
  }, [sellerId]);

  return (
    <>
      <div className="container" style={{ marginTop: '2rem' }}>
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '1rem',
          padding: '2rem', display: 'flex', alignItems: 'center', gap: '2rem',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', background: '#16a34a',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', fontWeight: 900, flexShrink: 0
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#0f172a' }}>{name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div style={{ color: '#f59e0b', fontSize: '1.2rem', letterSpacing: '2px' }}>{starsHtml}</div>
              <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.95rem' }}>{ratingText}</span>
            </div>
          </div>
          <div>
            <button 
              onClick={() => setIsModalOpen(true)}
              style={{
                background: '#16a34a', color: '#fff', border: 'none', padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(22,163,74,0.3)', transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
            >
              ⭐ Deixar Avaliação
            </button>
          </div>
        </div>
      </div>
      
      {isModalOpen && <ReviewModal sellerId={sellerId} onClose={() => setIsModalOpen(false)} />}
    </>
  );
}
