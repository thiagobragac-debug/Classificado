'use client';

import { useState, useMemo } from 'react';
import ReviewModal from './ReviewModal';
import { Star, Share2, ShieldCheck } from 'lucide-react';
import styles from './SellerProfileHeader.module.css';

export default function SellerProfileHeader({ 
  sellerId, 
  sellerName, 
  stats,
  sellerCreatedAt
}: { 
  sellerId: string;
  sellerName: string;
  stats: { total_reviews: number; avg_rating: number; verified?: boolean };
  sellerCreatedAt?: string | null;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { total_reviews: total, avg_rating: avg } = stats;
  const ratingText = total > 0 
    ? `(${total} avaliação${total > 1 ? 'ões' : ''}) • Média ${avg.toFixed(1)}` 
    : '(Nenhuma avaliação ainda)';

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Perfil de ${sellerName}`,
          text: `Confira os anúncios de ${sellerName} no Classificados.`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copiado para a área de transferência!');
      }
    } catch {
      // silent — share/clipboard errors are user-initiated cancellations
    }
  };

  // Generate deterministic gradient for avatar if needed, keeping default green for now.
  const avatarColorStyle = useMemo(() => {
    // We could generate hash from sellerName, but preserving layout/colors as requested.
    return { background: 'linear-gradient(135deg, #22c55e, #16a34a)' };
  }, []);

  const yearsActive = sellerCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(sellerCreatedAt).getTime()) / (1000 * 60 * 60 * 24 * 365)))
    : null;

  return (
    <>
      <div className="container" style={{ marginTop: '2rem' }}>
        <div className={styles.sellerHeaderCard}>
          <div className={styles.sellerBanner} />
          
          <div className={styles.sellerContent}>
            <div 
              className={styles.sellerAvatar}
              style={avatarColorStyle}
              role="img"
              aria-label={`Avatar de ${sellerName}`}
            >
              {sellerName.charAt(0).toUpperCase()}
            </div>
            
            <div className={styles.sellerInfo}>
              <div className={styles.sellerNameRow}>
                <h2 className={styles.sellerName}>{sellerName}</h2>
                {stats.verified && (
                  <div className={styles.sellerBadge} title="Vendedor Verificado">
                    <ShieldCheck size={14} />
                    <span>Verificado</span>
                  </div>
                )}
              </div>
              
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{avg.toFixed(1)}</span>
                  <span className={styles.statLabel}>Estrelas</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{total}</span>
                  <span className={styles.statLabel}>Avaliações</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>
                    {yearsActive !== null ? (yearsActive > 0 ? `${yearsActive}+` : '<1') : '—'}
                  </span>
                  <span className={styles.statLabel}>Anos vendendo</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '2px', color: '#f59e0b' }} aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      size={20} 
                      fill={star <= Math.round(avg) && total > 0 ? "currentColor" : "none"} 
                      strokeWidth={star <= Math.round(avg) && total > 0 ? 0 : 2}
                      style={{ opacity: total > 0 ? 1 : 0.4 }}
                    />
                  ))}
                </div>
                <span className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
                  Avaliação: {avg.toFixed(1)} de 5 estrelas
                </span>
                <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.95rem' }}>{ratingText}</span>
              </div>
            </div>
            
            <div className={styles.sellerActions}>
              <button onClick={handleShare} className={styles.btnShare} aria-label="Compartilhar perfil">
                <Share2 size={18} /> 
                <span>Compartilhar</span>
              </button>
              <button onClick={() => setIsModalOpen(true)} className={styles.btnReview}>
                <Star size={18} fill="currentColor" strokeWidth={0} /> Deixar Avaliação
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {isModalOpen && <ReviewModal sellerId={sellerId} onClose={() => setIsModalOpen(false)} />}
    </>
  );
}

