'use client';

import { useState, useMemo } from 'react';
import ReviewModal from './ReviewModal';
import { Star, Share2, ShieldCheck } from 'lucide-react';
import styles from './SellerProfileHeader.module.css';
import { useLang } from '@/lib/lang-context';

const TRANSLATIONS = {
  pt: {
    stars: 'Estrelas', reviews: 'Avaliações', yearsSelling: 'Anos vendendo',
    noReviewsYet: '(Nenhuma avaliação ainda)',
    // BUG CORRIGIDO (validação do zero, rodada 6): 'avaliação' + 'ões' vira
    // "avaliaçãoões" — precisa trocar o SUFIXO (ção/ções), não concatenar,
    // igual ao padrão já certo na versão em espanhol logo abaixo.
    ratingSummary: (total: number, avg: number) => `(${total} avalia${total > 1 ? 'ções' : 'ção'}) • Média ${avg.toFixed(1)}`,
    share: 'Compartilhar', shareProfile: 'Compartilhar perfil', evaluate: 'Avaliar',
    verifiedSeller: 'Vendedor Verificado', verified: 'Verificado',
    shareTitle: (name: string) => `Perfil de ${name}`,
    shareText: (name: string) => `Confira os anúncios de ${name} no Classificados.`,
    copied: 'Copiado!',
    avatarOf: (name: string) => `Avatar de ${name}`,
  },
  es: {
    stars: 'Estrellas', reviews: 'Valoraciones', yearsSelling: 'Años vendiendo',
    noReviewsYet: '(Aún sin valoraciones)',
    ratingSummary: (total: number, avg: number) => `(${total} valoraci${total > 1 ? 'ones' : 'ón'}) • Promedio ${avg.toFixed(1)}`,
    share: 'Compartir', shareProfile: 'Compartir perfil', evaluate: 'Valorar',
    verifiedSeller: 'Vendedor Verificado', verified: 'Verificado',
    shareTitle: (name: string) => `Perfil de ${name}`,
    shareText: (name: string) => `Consulta los anuncios de ${name} en Clasificados.`,
    copied: '¡Copiado!',
    avatarOf: (name: string) => `Avatar de ${name}`,
  },
};

export default function SellerProfileHeader({
  sellerId,
  sellerName,
  stats,
  sellerCreatedAt,
  avatarUrl,
  bannerUrl,
}: {
  sellerId: string;
  sellerName: string;
  stats: { total_reviews: number; avg_rating: number; verified?: boolean };
  sellerCreatedAt?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { lang } = useLang();
  const tr = TRANSLATIONS[lang];

  const { total_reviews: total, avg_rating: avg } = stats;
  const ratingText = total > 0
    ? tr.ratingSummary(total, avg)
    : tr.noReviewsYet;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: tr.shareTitle(sellerName),
          text: tr.shareText(sellerName),
          url: window.location.href,
        });
      } else {
        // BUG CORRIGIDO (varredura de usabilidade): fallback usava alert()
        // nativo, diferente do padrão de troca de texto/ícone inline já
        // usado em components/ads/AdSidebar.tsx (botão Compartilhar).
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
      <div className="container">
        <div className={styles.sellerHeaderCard}>
          {/* BUG CORRIGIDO (reteste do site, 2026-08-25): avatar_url/banner_url
              do vendedor eram lidos em outras partes do site (cards de anúncio,
              mensagens) mas nunca chegavam aqui — o header sempre mostrava a
              inicial genérica e o banner padrão, mesmo com foto real cadastrada. */}
          <div
            className={styles.sellerBanner}
            style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          />

          <div className={styles.sellerContent}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={tr.avatarOf(sellerName)}
                className={styles.sellerAvatar}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                className={styles.sellerAvatar}
                style={avatarColorStyle}
                role="img"
                aria-label={tr.avatarOf(sellerName)}
              >
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className={styles.sellerInfo}>
              <div className={styles.sellerNameRow}>
                <h2 className={styles.sellerName}>{sellerName}</h2>
                {stats.verified && (
                  <div className={styles.sellerBadge} title={tr.verifiedSeller}>
                    <ShieldCheck size={12} />
                    <span>{tr.verified}</span>
                  </div>
                )}
              </div>

              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{avg.toFixed(1)}</span>
                  <span className={styles.statLabel}>{tr.stars}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{total}</span>
                  <span className={styles.statLabel}>{tr.reviews}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>
                    {yearsActive !== null ? (yearsActive > 0 ? `${yearsActive}+` : '<1') : '—'}
                  </span>
                  <span className={styles.statLabel}>{tr.yearsSelling}</span>
                </div>

                {/* Estrelas inline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '1px', color: '#f59e0b' }} aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        size={14} 
                        fill={star <= Math.round(avg) && total > 0 ? "currentColor" : "none"} 
                        strokeWidth={star <= Math.round(avg) && total > 0 ? 0 : 1.5}
                        style={{ opacity: total > 0 ? 1 : 0.35 }}
                      />
                    ))}
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>{ratingText}</span>
                </div>
              </div>
            </div>
            
            <div className={styles.sellerActions}>
              <button onClick={handleShare} className={styles.btnShare} aria-label={tr.shareProfile}>
                <Share2 size={16} />
                <span>{copied ? tr.copied : tr.share}</span>
              </button>
              <button onClick={() => setIsModalOpen(true)} className={styles.btnReview}>
                <Star size={16} fill="currentColor" strokeWidth={0} /> {tr.evaluate}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {isModalOpen && <ReviewModal sellerId={sellerId} onClose={() => setIsModalOpen(false)} />}
    </>
  );

}

