import { notFound } from 'next/navigation';
import { createHash } from 'crypto';
import { headers } from 'next/headers';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { AdGallery } from '@/components/ads/AdGallery';
import { AdSidebar } from '@/components/ads/AdSidebar';
import { SimilarAds } from '@/components/ads/SimilarAds';
import { ShareButton } from '@/components/ads/ShareButton';
import { RecentViewTracker } from '@/components/ads/RecentViewTracker';
import { createAnonClient } from '@/lib/supabase-server';
import { getGeoParams } from '@/lib/listagem-utils';
import '../../anuncio.css';

// Sem singleton de módulo — cliente criado por-request dentro das funções
const FALLBACK_IMG = '/assets/hero_farm.webp';
const SB_STORAGE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/';

// Regex de validação de UUID v4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function imageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  if (path.startsWith('http')) return path;
  return SB_STORAGE + path;
}

function escapeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return { title: 'Anúncio não encontrado' };
  }

  const supabase = createAnonClient();
  const { data: ad } = await supabase
    .from('ads')
    .select('title_pt, title_es, description, images, status')
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();

  if (!ad) return { title: 'Anúncio não encontrado' };

  const title = ad.title_pt || ad.title_es || 'Anúncio';
  const imgUrl = ad.images?.[0] ? imageUrl(ad.images[0]) : null;
  // Remover tags HTML da description para o meta description
  const plainDescription = (ad.description || '').replace(/<[^>]*>/g, '').substring(0, 160);

  return {
    title: title,
    description: plainDescription || `Veja detalhes do anúncio ${title}`,
    alternates: {
      canonical: `https://tauzeclass.com.br/anuncio/${id}`,
      languages: {
        'pt-BR': `https://tauzeclass.com.br/anuncio/${id}?lang=pt`,
        'es-AR': `https://tauzeclass.com.br/anuncio/${id}?lang=es`,
      },
    },
    openGraph: {
      title: `${title} | Tauze Class`,
      description: plainDescription,
      images: imgUrl ? [{ url: imgUrl, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Tauze Class`,
      images: imgUrl ? [imgUrl] : [],
    },
  };
}

export default async function AdDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // ─── Validação de formato UUID ──────────────────────────────
  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  // ─── Cliente por-request (sem singleton de módulo) ──────────
  const supabase = createAnonClient();

  const { data: ad } = await supabase
    .from('ads')
    .select('*, profiles(id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .maybeSingle();

  if (!ad) {
    notFound();
  }

  // ─── Contagem de views com hash real do IP ──────────────────
  try {
    const headersList = await headers();
    const rawIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      '127.0.0.1';
    // Hash SHA-256 truncado do IP + adId para deduplicação real por visitante
    const ipHash = createHash('sha256').update(rawIp + id).digest('hex').slice(0, 16);
    await supabase.rpc('increment_ad_view_safe', { p_ad_id: id, p_ip_hash: ipHash });
  } catch (e) {
    // Não bloquear a renderização por falha de contagem
    console.error('[AdDetails] Failed to increment view:', e);
  }

  const adTitle = ad.title_pt || ad.title_es || 'Anúncio';
  const catName = ad.categories?.name_pt || ad.categories?.name_es || '';

  // ─── Geo do usuário para Anúncios Similares ──────────────────
  const geoContext = await getGeoParams({});
  const preferredCity = geoContext.cidade || ad.city;
  const preferredState = geoContext.estado || ad.state;

  // ─── Sanitização do HTML de description ────────────────────
  // Necessário mesmo com DOMPurify no save, pois registros antigos podem não ter sido sanitizados
  const allowedTags = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h3', 'h4'];
  const safeDescription = ad.description
    ? DOMPurify.sanitize(ad.description, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: [] })
    : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: adTitle,
    image: ad.images?.map((img: string) => imageUrl(img)) || [FALLBACK_IMG],
    description: (ad.description || adTitle).replace(/<[^>]*>/g, ''),
    offers: {
      '@type': 'Offer',
      priceCurrency: ad.currency || 'BRL',
      price: ad.price || 0,
      itemCondition: 'https://schema.org/UsedCondition',
      availability: ad.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Person',
        name: ad.profiles?.display_name || ad.profiles?.name || 'Vendedor',
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
      />
      <RecentViewTracker ad={ad} />

      {/* BREADCRUMB */}
      <div className="page-header ad-page-header">
        <div className="ad-page-header-pattern"></div>
        <div className="container ad-breadcrumb-container">
          <nav className="breadcrumb ad-breadcrumb-nav" aria-label="Navegação">
            <Link href="/">Início</Link>
            <span aria-hidden>›</span>
            <Link href={`/listagem${ad.category_id ? `?categoria=${ad.category_id}` : ''}`}>
              {catName || 'Anúncios'}
            </Link>
            <span aria-hidden>›</span>
            <strong className="ad-breadcrumb-current">Anúncio</strong>

            <div className="ad-breadcrumb-actions">
              <ShareButton title={adTitle} text={(ad.description || '').replace(/<[^>]*>/g, '').substring(0, 80)} />
              <Link href="/listagem" className="ad-breadcrumb-back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                Voltar aos resultados
              </Link>
            </div>
          </nav>
        </div>
      </div>

      {/* CONTENT */}
      <div className="container ad-main-content">
        <div className="product-grid">

          {/* LEFT COLUMN */}
          <div className="product-gallery-area ad-gallery-col">
            <AdGallery images={ad.images} videoUrl={ad.video_url} title={adTitle} />

            {safeDescription && (
              <div className="details-section ad-details-section" style={{ border: '1px solid var(--clr-border)', boxShadow: 'none', marginTop: '1.5rem' }}>
                <h3 className="ad-details-title">Descrição do Vendedor</h3>
                <div
                  className="desc-text text-gray-500 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: safeDescription }}
                />
              </div>
            )}

            {ad.tags_pt && ad.tags_pt.length > 0 && (
              <div className="details-section ad-details-section" style={{ border: 'none', boxShadow: 'none', marginTop: '1.5rem' }}>
                <h3 className="ad-details-title">Tags</h3>
                <div className="product-tags ad-tags-container">
                  {ad.tags_pt.map((tag: string) => (
                    <span key={tag} className="product-tag ad-tag-item">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <SimilarAds
              currentAdId={ad.id}
              categoryId={ad.category_id}
              city={preferredCity}
              state={preferredState}
            />
          </div>

          {/* RIGHT COLUMN */}
          <AdSidebar ad={ad} adTitle={adTitle} catName={catName} />
        </div>
      </div>

      {/* STICKY CTA MOBILE */}
      <div className="sticky-cta-mobile">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="ad-mobile-cta-price-label">Valor sugerido</span>
            <strong className="ad-mobile-cta-price-value">
              {ad.price
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: ad.currency || 'BRL' }).format(ad.price)
                : 'Consulte'}
            </strong>
          </div>
          <a
            href={`/api/contact-seller?adId=${ad.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--accent ad-mobile-cta-button"
          >
            Falar com Vendedor
          </a>
        </div>
      </div>
    </>
  );
}
