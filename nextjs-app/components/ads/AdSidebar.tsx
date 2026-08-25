'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Share2, Heart, AlertTriangle, CheckCircle, ShieldCheck, Mail } from 'lucide-react';
import { AdBanner } from '@/components/AdBanner';
import { AdMessageForm } from './AdMessageForm';
import { AdReportModal } from './AdReportModal';

// Minimal interfaces for the props we need
interface Profile {
  id: string;
  name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  created_at: string;
  kyc_status: string | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
}

interface Ad {
  id: string;
  title_pt: string | null;
  title_es: string | null;
  price: number | null;
  currency: string | null;
  price_unit_pt: string | null;
  negotiable: boolean | null;
  city: string | null;
  state: string | null;
  country: string | null;
  views_count: number | null;
  created_at: string;
  user_id: string | null;
  profiles: Profile | null;
  categories: { icon: string | null; name_pt: string; name_es: string } | null;
}

interface AdSidebarProps {
  ad: Ad;
  adTitle: string;
  catName: string;
  hasWhatsapp: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function memberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function AdSidebar({ ad, adTitle, catName, hasWhatsapp }: AdSidebarProps) {
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!ad.id) return;
    const favs: string[] = JSON.parse(localStorage.getItem('tc_favorites') || '[]');
    setIsFav(favs.includes(ad.id));
  }, [ad.id]);

  const toggleFav = useCallback(() => {
    if (favLoading) return;
    setFavLoading(true);
    const favs: string[] = JSON.parse(localStorage.getItem('tc_favorites') || '[]');
    if (isFav) {
      const updated = favs.filter(f => f !== ad.id);
      localStorage.setItem('tc_favorites', JSON.stringify(updated));
      setIsFav(false);
    } else {
      favs.push(ad.id);
      localStorage.setItem('tc_favorites', JSON.stringify(favs));
      setIsFav(true);
    }
    setFavLoading(false);
  }, [isFav, ad.id, favLoading]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: adTitle, url });
      } catch (err) { /* ignore cancel */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sellerName = ad.profiles?.display_name || ad.profiles?.name || 'Vendedor';
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  const locationParts = [ad.city, ad.state, ad.country].filter(Boolean);

  return (
    <div className="sidebar-fixed-container">
      <div className="sidebar-sticky-wrapper">
        <div className="product-info-panel">
          
          {/* Meta top */}
          <div className="product-meta-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
            <span className="tag-status" style={{ background: 'var(--clr-surface-alt)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontWeight: 500 }}>
              {catName && `${ad.categories?.icon || '🗂️'} ${catName}`}
            </span>
            <span className="views-count" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--clr-text-muted)' }}>
              👁️ {ad.views_count ?? 0}
              <span style={{ marginLeft: '0.25rem', opacity: 0.6 }}>· {timeAgo(ad.created_at)}</span>
            </span>
          </div>

          <h1 className="product-title" style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>
            {adTitle}
          </h1>

          {/* Price */}
          <div className="product-price">
            {ad.price !== null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--clr-primary, #16A34A)' }}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ad.currency || 'BRL', minimumFractionDigits: 0 }).format(ad.price)}
                </span>
                {ad.price_unit_pt && <span className="product-price-unit" style={{ color: 'var(--clr-text-muted)', fontWeight: 500 }}>/ {ad.price_unit_pt}</span>}
              </div>
            ) : (
              // BUG CORRIGIDO (teste completo do site, 2026-08-24): texto
              // diferente de AdCard.tsx/SimilarAdsCarousel.tsx pro mesmo
              // estado (preço nulo) — unificado em "Sob consulta".
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--clr-text-muted)' }}>Sob consulta</span>
            )}
            {ad.negotiable && <span className="tag-negotiable" style={{ display: 'inline-block', marginTop: '0.5rem', background: '#dcfce7', color: '#166534', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>Negociável</span>}
          </div>

          {/* Location */}
          {locationParts.length > 0 && (
            <div className="ad-location-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--clr-text-muted)' }}>
              📍 {locationParts.join(', ')}
            </div>
          )}

          {/* Seller card */}
          <Link href={`/vendedor/${ad.user_id}`} className="seller-card-mini" style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'var(--clr-surface-alt)', borderRadius: '1rem', textDecoration: 'none', color: 'inherit' }}>
            <div className="seller-avatar-lg" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--clr-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
              {ad.profiles?.avatar_url ? (
                <img src={ad.profiles.avatar_url} alt={sellerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                sellerInitial
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="seller-name" style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {sellerName}
                {ad.profiles?.verified && <CheckCircle className="w-4 h-4 text-green-600" />}
              </div>
              
              <div className="seller-badges" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {ad.profiles?.email_verified && <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '4px' }}>✓ E-mail verificado</span>}
                {ad.profiles?.phone_verified && <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '4px' }}>✓ Telefone verificado</span>}
                {ad.profiles?.kyc_status === 'approved' && <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'linear-gradient(to right, #fef3c7, #fde68a)', color: '#92400e', padding: '4px 8px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck className="w-3 h-3"/> Identidade confirmada</span>}
              </div>
              <div className="seller-member" style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', marginTop: '0.75rem' }}>
                Membro desde {ad.profiles?.created_at ? memberSince(ad.profiles.created_at) : '—'}
              </div>
            </div>
          </Link>

          {/* Action buttons */}
          <div className="action-column" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hasWhatsapp ? (
              <a
                href={`/api/contact-seller?adId=${ad.id}`}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: '#25D366', color: 'white', borderRadius: '0.8rem', textDecoration: 'none' }}
              >
                Falar pelo WhatsApp
              </a>
            ) : (
              <button className="btn" disabled style={{ width: '100%', padding: '1rem', opacity: 0.5, cursor: 'not-allowed', borderRadius: '0.8rem' }}>
                WhatsApp não disponível
              </button>
            )}

            <button
              className="btn btn-outline"
              onClick={() => setMsgOpen(!msgOpen)}
              style={{ width: '100%', padding: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', borderRadius: '0.8rem', border: '1px solid var(--clr-border)', background: 'transparent', cursor: 'pointer' }}
            >
              <Mail className="w-5 h-5" />
              {msgOpen ? 'Fechar Mensagem' : 'Enviar Mensagem Interna'}
            </button>
            
            {msgOpen && <AdMessageForm adId={ad.id} receiverId={ad.user_id} />}

            {/* Discreet actions */}
            <div className="discreet-actions-row" style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem', borderTop: 'none', borderBottom: 'none' }}>
              <button onClick={share} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--clr-text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>
                <Share2 className="w-4 h-4" /> {copied ? 'Copiado!' : 'Compartilhar'}
              </button>
              <button onClick={toggleFav} disabled={favLoading} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', color: isFav ? '#ef4444' : 'var(--clr-text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>
                <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} /> {isFav ? 'Salvo' : 'Salvar'}
              </button>
              <button onClick={() => setReportOpen(true)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--clr-text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>
                <AlertTriangle className="w-4 h-4" /> Denunciar
              </button>
            </div>
          </div>

          <AdReportModal adId={ad.id} isOpen={reportOpen} onClose={() => setReportOpen(false)} />

          <div className="security-tip-box" style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.8rem', color: '#991b1b', fontSize: '0.875rem', lineHeight: 1.5 }}>
            <strong>🔒 Dica de Segurança:</strong> Nunca faça depósitos antecipados sem ver o produto pessoalmente. Desconfie de preços muito abaixo do mercado.
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <AdBanner position="anuncio_sidebar" />
      </div>
    </div>
  );
}
