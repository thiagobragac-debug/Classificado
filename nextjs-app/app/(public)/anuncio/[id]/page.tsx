'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { AdBanner } from '@/components/AdBanner';
import { useLang } from '@/lib/lang-context';
import { useRecentViews } from '@/lib/useRecentViews';

const SB_STORAGE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/';
const FALLBACK_IMG = '/assets/hero_farm.webp';

// -- Types --------------------------------------------------------------------
interface Profile {
  id: string;
  name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  verified: boolean | null;
  phone_whatsapp: string | null;
  country: string | null;
  created_at: string;
  kyc_status: string | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
}

interface Category {
  name_pt: string;
  name_es: string;
  icon: string | null;
}

interface Ad {
  id: string;
  title_pt: string | null;
  title_es: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  price_unit_pt: string | null;
  negotiable: boolean | null;
  country: string | null;
  state: string | null;
  city: string | null;
  location_text: string | null;
  images: string[] | null;
  video_url: string | null;
  tags_pt: string[] | null;
  status: string | null;
  featured: boolean | null;
  views_count: number | null;
  created_at: string;
  category_id: string | null;
  user_id: string | null;
  profiles: Profile | null;
  categories: Category | null;
}

// -- Helpers ------------------------------------------------------------------
function imageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  if (path.startsWith('http')) return path;
  return SB_STORAGE + path;
}

function formatPrice(price: number | null, currency: string | null, unit: string | null): string {
  if (price === null || price === undefined) return 'Consultar';
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
  return unit ? `${formatted} / ${unit}` : formatted;
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

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// -- Mini Ad Card for Similar Ads ---------------------------------------------
function MiniAdCard({ ad, lang }: { ad: Ad; lang: string }) {
  const title = (lang === 'es' ? ad.title_es : ad.title_pt) || ad.title_pt || 'Sem título';
  const img = ad.images?.[0] ? imageUrl(ad.images[0]) : FALLBACK_IMG;
  const locParts = [ad.city, ad.state].filter(Boolean).join(', ');
  return (
    <Link
      href={`/anuncio/${ad.id}`}
      className="ad-card fade-in-up"
      style={{ display: 'block', minWidth: 220, maxWidth: 260, flexShrink: 0, textDecoration: 'none' }}
    >
      <div className="ad-card__image">
        <img src={img} alt={title} loading="lazy"
          onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
        {ad.featured && (
          <div className="ad-card__category-badge" style={{ background: 'var(--clr-accent)', color: 'white' }}>⭐ Destaque</div>
        )}
      </div>
      <div className="ad-card__body">
        <h3 className="ad-card__title">{title}</h3>
        <div className="ad-card__price">
          {ad.price != null
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ad.currency || 'BRL', minimumFractionDigits: 0 }).format(ad.price)
            : 'Sob consulta'}
          {ad.price_unit_pt && <small>/ {ad.price_unit_pt}</small>}
        </div>
        {locParts && (
          <div className="ad-card__meta">
            <div className="ad-card__location">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{locParts}</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

// -- Main Page -----------------------------------------------------------------
export default function AnuncioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLang();
  const sb = getSupabase();
  const { recordView } = useRecentViews();

  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentImg, setCurrentImg] = useState(0);
  const [sellerRating, setSellerRating] = useState<{ avg: number; total: number } | null>(null);
  const [similarAds, setSimilarAds] = useState<Ad[]>([]);
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgStatus, setMsgStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [msgSending, setMsgSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const viewIncrementedRef = useRef(false);

  // -- Load ad ----------------------------------------------------------------
  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    const load = async () => {
      const { data, error } = await sb
        .from('ads')
        .select('*, profiles(id, name, display_name, avatar_url, banner_url, verified, phone_whatsapp, country, created_at, kyc_status, email_verified, phone_verified), categories(name_pt, name_es, icon)')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setAd(data as Ad);
      setLoading(false);
      recordView(data as Ad);

      // Increment views (once per session)
      if (!viewIncrementedRef.current) {
        viewIncrementedRef.current = true;
        try {
          await sb.rpc('increment_ad_view_safe', { p_ad_id: id, p_ip_hash: 'client' });
        } catch { /* silent */ }
      }
    };

    load();
  }, [id]); // eslint-disable-line

  // -- Seller rating ----------------------------------------------------------
  useEffect(() => {
    if (!ad?.user_id) return;
    sb.rpc('get_seller_stats', { p_seller_id: ad.user_id })
      .then(({ data }: { data: any }) => {
        if (data) setSellerRating({ avg: data.avg_rating ?? 0, total: data.total_reviews ?? 0 });
      }).catch(() => {});
  }, [ad?.user_id]); // eslint-disable-line

  // -- Similar ads (4-level cascade) -----------------------------------------
  useEffect(() => {
    if (!ad) return;
    const fetchSimilar = async () => {
      const base = sb.from('ads')
        .select('id, title_pt, title_es, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at, profiles(id, name)')
        .eq('status', 'active')
        .neq('id', ad.id)
        .limit(10);

      // L1: Same category + city
      if (ad.category_id && ad.city) {
        const { data } = await base.eq('category_id', ad.category_id).eq('city', ad.city);
        if (data && data.length >= 4) { setSimilarAds(data as unknown as Ad[]); return; }
      }
      // L2: Same category + state
      if (ad.category_id && ad.state) {
        const { data } = await base.eq('category_id', ad.category_id).eq('state', ad.state);
        if (data && data.length >= 4) { setSimilarAds(data as unknown as Ad[]); return; }
      }
      // L3: Same category global
      if (ad.category_id) {
        const { data } = await base.eq('category_id', ad.category_id);
        if (data && data.length > 0) { setSimilarAds(data as unknown as Ad[]); return; }
      }
      // L4: Any recent ads
      const { data } = await sb.from('ads')
        .select('id, title_pt, title_es, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at')
        .eq('status', 'active').neq('id', ad.id).order('created_at', { ascending: false }).limit(8);
      if (data) setSimilarAds(data as unknown as Ad[]);
    };
    fetchSimilar();
  }, [ad]); // eslint-disable-line

  // -- Favorite ---------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    const favs: string[] = JSON.parse(localStorage.getItem('tc_favorites') || '[]');
    setIsFav(favs.includes(id));
  }, [id]);

  const toggleFav = useCallback(async () => {
    if (favLoading) return;
    setFavLoading(true);
    const favs: string[] = JSON.parse(localStorage.getItem('tc_favorites') || '[]');
    if (isFav) {
      const updated = favs.filter(f => f !== id);
      localStorage.setItem('tc_favorites', JSON.stringify(updated));
      setIsFav(false);
    } else {
      favs.push(id!);
      localStorage.setItem('tc_favorites', JSON.stringify(favs));
      setIsFav(true);
    }
    setFavLoading(false);
  }, [isFav, id, favLoading]);

  // -- Send message -----------------------------------------------------------
  const sendMessage = async () => {
    if (!msgText.trim() || !ad) return;
    setMsgSending(true);
    setMsgStatus(null);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      setMsgStatus({ type: 'error', text: 'Você precisa estar logado para enviar mensagens.' });
      setMsgSending(false);
      return;
    }
    const { error } = await sb.from('messages').insert({
      ad_id: ad.id,
      sender_id: session.user.id,
      receiver_id: ad.user_id,
      content: msgText.trim(),
    });
    if (error) {
      setMsgStatus({ type: 'error', text: 'Erro ao enviar. Tente novamente.' });
    } else {
      setMsgStatus({ type: 'success', text: '✓ Mensagem enviada com sucesso!' });
      setMsgText('');
    }
    setMsgSending(false);
  };

  // -- Report -----------------------------------------------------------------
  const sendReport = async () => {
    if (!reportReason || !ad) return;
    const { data: { session } } = await sb.auth.getSession();
    await sb.from('reports').insert({
      ad_id: ad.id,
      reporter_id: session?.user?.id ?? null,
      reason: reportReason,
      severity: 'low',
    });
    setReportSent(true);
  };

  // -- Share ------------------------------------------------------------------
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: adTitle, url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // -- Gallery nav ------------------------------------------------------------
  const images = ad?.images?.length ? ad.images : [];
  const media: { type: 'video' | 'image', url: string }[] = [];
  if (ad?.video_url) media.push({ type: 'video', url: ad.video_url });
  images.forEach(img => media.push({ type: 'image', url: imageUrl(img) }));
  if (media.length === 0) media.push({ type: 'image', url: FALLBACK_IMG });

  const totalMedia = media.length;
  const prevMedia = () => setCurrentImg(i => (i - 1 + totalMedia) % totalMedia);
  const nextMedia = () => setCurrentImg(i => (i + 1) % totalMedia);

  // -- Derived values ---------------------------------------------------------
  const adTitle = (lang === 'es' ? ad?.title_es : ad?.title_pt) || ad?.title_pt || 'Anúncio';
  const catName = (lang === 'es' ? ad?.categories?.name_es : ad?.categories?.name_pt) || ad?.categories?.name_pt || '';
  const sellerName = ad?.profiles?.display_name || ad?.profiles?.name || 'Vendedor';
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  const locationParts = [ad?.city, ad?.state, ad?.country].filter(Boolean);
  const whatsappNum = ad?.profiles?.phone_whatsapp?.replace(/\D/g, '');
  const whatsappMsg = encodeURIComponent(`Olá! Vi seu anúncio "${adTitle}" no Tauze Class e gostaria de saber mais.`);

  // -- Skeleton ---------------------------------------------------------------
  if (loading) return (
    <div className="container" style={{ paddingTop: 'calc(var(--header-h) + 3rem)', paddingBottom: '4rem' }}>
      <div className="product-grid anuncio-skeleton">
        <div className="product-gallery-area">
          <div className="skel-gallery" />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ width: 80, height: 80, background: 'var(--clr-surface-alt)', borderRadius: '0.8rem' }} />)}
          </div>
          <div style={{ marginTop: '2rem' }}>
            <div className="skel-line" style={{ width: '60%', height: 24 }} />
            <div className="skel-line" style={{ width: '90%', height: 12 }} />
            <div className="skel-line" style={{ width: '75%', height: 12 }} />
          </div>
        </div>
        <div className="skel-panel" />
      </div>
    </div>
  );

  // -- Not found --------------------------------------------------------------
  if (notFound || !ad) return (
    <div style={{ paddingTop: 'calc(var(--header-h) + 5rem)', padding: 'calc(var(--header-h) + 5rem) 1rem 6rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>😕</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Anúncio não encontrado</h1>
      <p style={{ color: 'var(--clr-text-muted)', marginBottom: '2rem' }}>Este anúncio pode ter expirado ou sido removido.</p>
      <Link href="/listagem" className="btn btn--primary">Ver todos os anúncios</Link>
    </div>
  );

  // -- JSON-LD Schema ---------------------------------------------------------
  const jsonLd = ad ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": adTitle,
    "image": ad.images?.map(img => imageUrl(img)) || [FALLBACK_IMG],
    "description": ad.description || adTitle,
    "offers": {
      "@type": "Offer",
      "url": typeof window !== 'undefined' ? window.location.href : '',
      "priceCurrency": ad.currency || "BRL",
      "price": ad.price || 0,
      "itemCondition": "https://schema.org/UsedCondition",
      "availability": ad.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Person",
        "name": sellerName
      }
    }
  } : null;

  // -- Main render ------------------------------------------------------------
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {/* BREADCRUMB — banner original (classes e inline styles exatos) */}
      <div className="page-header" style={{
        paddingTop: 'calc(var(--header-h) + 1rem)',
        paddingBottom: '7.5rem',
        background: 'linear-gradient(135deg, var(--clr-primary-mid, #16A34A), var(--clr-primary, #15803D))',
        position: 'relative',
        borderRadius: '0 0 2rem 2rem'
      }}>
        {/* Abstract pattern for premium feel */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          borderRadius: 'inherit'
        }}></div>

        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <nav className="breadcrumb" aria-label="Navegação" style={{ justifyContent: 'flex-start', marginBottom: 0, display: 'flex', alignItems: 'center' }}>
            <Link href="/">Início</Link>
            <span aria-hidden>›</span>
            <Link href={`/listagem${ad.category_id ? `?categoria=${ad.category_id}` : ''}`}>
              {catName || 'Anúncios'}
            </Link>
            <span aria-hidden>›</span>
            <strong style={{ color: 'white', fontWeight: 600 }}>Anúncio</strong>
            
            <button
              onClick={() => router.back()}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.9)', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600, padding: 0,
                marginLeft: 'auto'
              }}
              aria-label="Voltar aos resultados"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Voltar aos resultados
            </button>
          </nav>
        </div>
      </div>

      {/* CONTEUDO — margin-top negativo puxa o card para cima do banner (como no original) */}
      <div className="container" style={{ marginTop: '-4rem', paddingBottom: '4rem', position: 'relative', zIndex: 10 }}>
        <div className="product-grid">

          {/* -- LEFT COLUMN ----------------------------------------------- */}
          <div className="product-gallery-area">

            {/* Gallery */}
            <div className="gallery-main-wrapper">
              {/* Nav buttons */}
              {totalMedia > 1 && (
                <>
                  <button className="gallery-nav-btn prev visible" onClick={prevMedia} aria-label="Imagem anterior" style={{ color: 'var(--clr-text)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>
                  <button className="gallery-nav-btn next visible" onClick={nextMedia} aria-label="Próxima imagem" style={{ color: 'var(--clr-text)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </>
              )}

              {/* Video or Image */}
              {media[currentImg].type === 'video' ? (
                <video
                  src={media[currentImg].url} controls
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
                />
              ) : (
                <img
                  src={media[currentImg].url}
                  alt={adTitle}
                  className="gallery-main"
                  onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }}
                />
              )}
            </div>

            {/* Thumbnails */}
            {totalMedia > 1 && (
              <div className="gallery-thumbs">
                {media.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setCurrentImg(idx)} 
                    className={idx === currentImg ? 'active' : ''} 
                    style={{ position: 'relative', width: 80, height: 80, cursor: 'pointer', flexShrink: 0, borderRadius: '0.8rem', overflow: 'hidden', border: idx === currentImg ? '3px solid var(--clr-primary)' : '3px solid transparent', transition: 'all 0.2s', background: '#000' }}
                  >
                    {item.type === 'video' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: 'white' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    ) : (
                      <img src={item.url} alt={`Mídia ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            {ad.description && (
              <div className="details-section">
                <h3>Descrição do Vendedor</h3>
                <div
                  className="desc-text"
                  dangerouslySetInnerHTML={{ __html: ad.description }}
                />
              </div>
            )}

            {/* Tags */}
            {ad.tags_pt && ad.tags_pt.length > 0 && (
              <div className="details-section" style={{ marginTop: '1.5rem' }}>
                <h3>Tags</h3>
                <div className="product-tags">
                  {ad.tags_pt.map(tag => (
                    <span key={tag} className="product-tag">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Similar ads */}
            {similarAds.length > 0 && (
              <div className="similar-ads-section">
                <div className="carousel-header">
                  <h3>Anúncios Similares</h3>
                  <div className="carousel-controls">
                    <button className="btn-carousel" onClick={() => carouselRef.current?.scrollBy({ left: -280, behavior: 'smooth' })} aria-label="Rolar para esquerda">‹</button>
                    <button className="btn-carousel" onClick={() => carouselRef.current?.scrollBy({ left: 280, behavior: 'smooth' })} aria-label="Rolar para direita">›</button>
                  </div>
                </div>
                <div className="similar-ads-carousel" ref={carouselRef}>
                  {similarAds.map(s => <MiniAdCard key={s.id} ad={s} lang={lang} />)}
                </div>
              </div>
            )}
          </div>

          {/* -- RIGHT COLUMN — Sticky Sidebar ----------------------------- */}
          <div className="sidebar-fixed-container">
            <div className="sidebar-sticky-wrapper">
              <div className="product-info-panel">

                {/* Meta top */}
                <div className="product-meta-top">
                  <span className="tag-status">
                    {catName && `${ad.categories?.icon || '🗂️'} ${catName}`}
                  </span>
                  <span className="views-count">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {ad.views_count ?? 0} visualizações
                    <span style={{ marginLeft: '0.5rem', color: 'var(--clr-text-light)' }}>· {timeAgo(ad.created_at)}</span>
                  </span>
                </div>

                {/* Title */}
                <h1 className="product-title">{adTitle}</h1>

                {/* Price */}
                <div className="product-price">
                  {ad.price !== null ? (
                    <>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ad.currency || 'BRL', minimumFractionDigits: 0 }).format(ad.price)}</span>
                      {ad.price_unit_pt && <span className="product-price-unit">/ {ad.price_unit_pt}</span>}
                    </>
                  ) : (
                    <span style={{ fontSize: '1.5rem', color: 'var(--clr-text-muted)' }}>Consultar preço</span>
                  )}
                  {ad.negotiable && <span className="tag-negotiable">Negociável</span>}
                </div>

                {/* Location */}
                {locationParts.length > 0 && (
                  <div className="ad-location-line">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {locationParts.join(', ')}
                  </div>
                )}

                {/* Seller card */}
                <Link href={`/vendedor/${ad.user_id}`} className="seller-card-mini">
                  <div className="seller-avatar-lg">
                    {ad.profiles?.avatar_url ? (
                      <img src={ad.profiles.avatar_url} alt={sellerName} />
                    ) : (
                      sellerInitial
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="seller-name">
                      {sellerName}
                      {ad.profiles?.verified === true && (
                        <span className="seller-badge verified" style={{ marginLeft: '0.5rem' }}>✓ Verificado</span>
                      )}
                      {ad.profiles?.verified === false && (
                        <span className="seller-badge" style={{ marginLeft: '0.5rem', background: '#FEF3C7', color: '#92400E' }}>Não verificado</span>
                      )}
                    </div>
                    {sellerRating && sellerRating.total > 0 && (
                      <div className="seller-stars">
                        {renderStars(sellerRating.avg)} ({sellerRating.total})
                      </div>
                    )}
                    <div className="seller-badges">
                      {ad.profiles?.email_verified && <span className="seller-badge email">✓ E-mail</span>}
                      {ad.profiles?.phone_verified && <span className="seller-badge phone">✓ WhatsApp</span>}
                      {ad.profiles?.kyc_status === 'approved' && <span className="seller-badge">🛡️ Identidade</span>}
                    </div>
                    <div className="seller-member">
                      Membro desde {ad.profiles?.created_at ? memberSince(ad.profiles.created_at) : '—'}
                    </div>
                  </div>
                </Link>

                {/* Action buttons */}
                <div className="action-column">
                  {/* WhatsApp */}
                  {whatsappNum ? (
                    <a
                      href={`https://wa.me/${whatsappNum}?text=${whatsappMsg}`}
                      target="_blank" rel="noopener noreferrer"
                      className="btn-whatsapp-large"
                      id="btn-whatsapp"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.04.507 3.96 1.4 5.641L0 24l6.537-1.38C8.144 23.493 10.022 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.848 0-3.574-.49-5.072-1.346L6.5 20.5l-3.5.739.747-3.433C2.568 16.25 2 14.196 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                      Falar pelo WhatsApp
                    </a>
                  ) : (
                    <button className="btn-whatsapp-large" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                      WhatsApp não disponível
                    </button>
                  )}

                  {/* Discreet actions: share, favorite, report */}
                  <div className="discreet-actions-row">
                    <button className="discreet-btn" onClick={share} id="btn-share">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      {copied ? 'Copiado!' : 'Compartilhar'}
                    </button>
                    <button className={`discreet-btn ${isFav ? 'saved' : ''}`} onClick={toggleFav} id="btn-favorite" disabled={favLoading}>
                      {isFav ? '❤️ Salvo' : '🤍 Salvar'}
                    </button>
                    <button className="discreet-btn" onClick={() => setReportOpen(true)} id="btn-report">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Denunciar
                    </button>
                  </div>

                  {/* Message form */}
                  <div className="msg-section">
                    <button
                      className="btn-secondary-large"
                      onClick={() => setMsgOpen(o => !o)}
                      id="btn-toggle-msg"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      {msgOpen ? 'Fechar mensagem' : 'Enviar Mensagem'}
                    </button>
                    {msgOpen && (
                      <div className="msg-body">
                        {msgStatus && (
                          <div className={`msg-alert ${msgStatus.type}`}>{msgStatus.text}</div>
                        )}
                        <textarea
                          className="msg-textarea"
                          placeholder="Olá! Tenho interesse neste anúncio e gostaria de mais informações..."
                          value={msgText}
                          onChange={e => setMsgText(e.target.value)}
                          id="msg-text"
                        />
                        <button
                          className="btn btn-primary"
                          onClick={sendMessage}
                          disabled={msgSending || !msgText.trim()}
                          id="btn-send-msg"
                        >
                          {msgSending ? 'Enviando…' : 'Enviar Mensagem'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Security tip */}
                <div className="security-tip-box">
                  <strong>🔒 Dica de Segurança:</strong> Nunca faça depósitos antecipados sem ver o produto pessoalmente. Desconfie de preços muito abaixo do mercado.
                </div>
              </div>
            </div>

            {/* Ad Banner dinâmico da Sidebar */}
            <AdBanner position="anuncio_sidebar" />
          </div>
        </div>
      </div>

      {/* -- Report Modal --------------------------------------------------- */}
      {reportOpen && (
        <div className="report-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setReportOpen(false); }}>
          <div className="report-modal-box" role="dialog" aria-modal="true" aria-label="Denunciar anúncio">
            {reportSent ? (
              <>
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                  <h3>Denúncia enviada!</h3>
                  <p style={{ color: 'var(--clr-text-muted)', marginTop: '0.5rem' }}>Nossa equipe irá analisar em breve.</p>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => { setReportOpen(false); setReportSent(false); setReportReason(''); }}>
                  Fechar
                </button>
              </>
            ) : (
              <>
                <h3>⚠️ Denunciar Anúncio</h3>
                <div className="report-reasons">
                  {['Produto inexistente ou falso', 'Preço enganoso', 'Conteúdo inapropriado', 'Spam ou publicidade enganosa', 'Golpe ou fraude', 'Outro'].map(reason => (
                    <button
                      key={reason}
                      className={`report-reason-btn ${reportReason === reason ? 'selected' : ''}`}
                      onClick={() => setReportReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn" style={{ flex: 1, padding: '0.8rem', border: '1px solid var(--clr-border)', borderRadius: '0.8rem', cursor: 'pointer' }} onClick={() => setReportOpen(false)}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={sendReport} disabled={!reportReason}>
                    Enviar Denúncia
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
