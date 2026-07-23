import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { AdGallery } from '@/components/ads/AdGallery';
import { AdSidebar } from '@/components/ads/AdSidebar';
import { SimilarAds } from '@/components/ads/SimilarAds';
import { ShareButton } from '@/components/ads/ShareButton';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const FALLBACK_IMG = '/assets/hero_farm.webp';
const SB_STORAGE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/';

function imageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  if (path.startsWith('http')) return path;
  return SB_STORAGE + path;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: ad } = await supabase
    .from('ads')
    .select('title_pt, title_es, description, images')
    .eq('id', id)
    .maybeSingle();

  if (!ad) return { title: 'Anúncio não encontrado' };

  const title = ad.title_pt || ad.title_es || 'Anúncio';
  const imgUrl = ad.images?.[0] ? imageUrl(ad.images[0]) : null;

  return {
    title: `${title} | Tauze Class`,
    description: ad.description?.substring(0, 160) || `Veja detalhes do anúncio ${title}`,
    openGraph: {
      title: `${title} | Tauze Class`,
      description: ad.description?.substring(0, 160),
      images: imgUrl ? [{ url: imgUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Tauze Class`,
      images: imgUrl ? [imgUrl] : [],
    }
  };
}

export default async function AdDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: ad } = await supabase
    .from('ads')
    .select('*, profiles(id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at, kyc_status, email_verified, phone_verified), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .maybeSingle();

  if (!ad) {
    notFound();
  }

  // Increment view count (fire and forget)
  supabase.rpc('increment_ad_view_safe', { p_ad_id: id, p_ip_hash: 'ssr-client' }).then(() => {});

  const adTitle = ad.title_pt || ad.title_es || 'Anúncio';
  const catName = ad.categories?.name_pt || ad.categories?.name_es || '';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": adTitle,
    "image": ad.images?.map((img: string) => imageUrl(img)) || [FALLBACK_IMG],
    "description": ad.description || adTitle,
    "offers": {
      "@type": "Offer",
      "priceCurrency": ad.currency || "BRL",
      "price": ad.price || 0,
      "itemCondition": "https://schema.org/UsedCondition",
      "availability": ad.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Person",
        "name": ad.profiles?.display_name || ad.profiles?.name || 'Vendedor'
      }
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      
      {/* BREADCRUMB */}
      <div className="page-header" style={{
        paddingTop: 'calc(var(--header-h) + 1rem)',
        paddingBottom: '7.5rem',
        background: 'linear-gradient(135deg, var(--clr-primary-mid, #16A34A), var(--clr-primary, #15803D))',
        position: 'relative',
        borderRadius: '0 0 2rem 2rem'
      }}>
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
            
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <ShareButton title={adTitle} text={ad.description?.substring(0, 80) || ''} />
              
              <Link
                href="/listagem"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  color: 'rgba(255,255,255,0.9)', textDecoration: 'none',
                  fontSize: '0.875rem', fontWeight: 600, padding: 0
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg> Voltar aos resultados
              </Link>
            </div>
          </nav>
        </div>
      </div>

      {/* CONTENT */}
      <div className="container" style={{ marginTop: '-4rem', paddingBottom: '4rem', position: 'relative', zIndex: 10 }}>
        <div className="product-grid" style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 340px' }}>
          
          {/* LEFT COLUMN */}
          <div className="product-gallery-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
            <AdGallery images={ad.images} videoUrl={ad.video_url} title={adTitle} />
            
            {ad.description && (
              <div className="details-section" style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--clr-border)' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Descrição do Vendedor</h3>
                <div
                  className="desc-text"
                  dangerouslySetInnerHTML={{ __html: ad.description }}
                  style={{ lineHeight: 1.6, color: 'var(--clr-text-muted)' }}
                />
              </div>
            )}

            {ad.tags_pt && ad.tags_pt.length > 0 && (
              <div className="details-section" style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--clr-border)' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Tags</h3>
                <div className="product-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {ad.tags_pt.map((tag: string) => (
                    <span key={tag} className="product-tag" style={{ background: 'var(--clr-surface-alt)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.875rem' }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <SimilarAds 
              currentAdId={ad.id} 
              categoryId={ad.category_id} 
              city={ad.city} 
              state={ad.state} 
            />
          </div>

          {/* RIGHT COLUMN */}
          <AdSidebar 
            ad={ad} 
            adTitle={adTitle} 
            catName={catName} 
          />
        </div>
      </div>
      
      {/* STICKY CTA MOBILE */}
      <div className="sticky-cta-mobile">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', opacity: 0.8, display: 'block' }}>Valor sugerido</span>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {ad.price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ad.currency || 'BRL' }).format(ad.price) : 'Consulte'}
            </strong>
          </div>
          <a
            href={ad.profiles?.phone_whatsapp ? `https://wa.me/${ad.profiles.phone_whatsapp.replace(/\D/g,'')}?text=Olá, tenho interesse no anúncio ${adTitle}` : '#vendedor-sidebar'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--accent"
            style={{ padding: '0.75rem 1.5rem', borderRadius: '2rem' }}
          >
            Falar com Vendedor
          </a>
        </div>
      </div>
      
      {/* 
        The style is required for mobile grid 
      */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 991px) {
          .product-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .sticky-cta-mobile {
          display: none;
        }
        @media (max-width: 768px) {
          .sticky-cta-mobile {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--clr-surface);
            padding: 1rem;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
            z-index: 100;
            border-top: 1px solid var(--clr-border);
          }
          /* Adjust body padding so sticky cta doesnt hide content */
          body {
            padding-bottom: 80px;
          }
        }
      `}} />
    </>
  );
}
