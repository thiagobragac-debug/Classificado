import { notFound } from 'next/navigation';
import { createHash } from 'crypto';
import { headers, cookies } from 'next/headers';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { AdGallery } from '@/components/ads/AdGallery';
import { AdSidebar } from '@/components/ads/AdSidebar';
import { SimilarAds } from '@/components/ads/SimilarAds';
import { ShareButton } from '@/components/ads/ShareButton';
import { RecentViewTracker } from '@/components/ads/RecentViewTracker';
import { createAnonClient } from '@/lib/supabase-server';
import { getGeoParams } from '@/lib/listagem-utils';
import { t as _t, type Lang } from '@/lib/constants';
import '../../anuncio.css';

// Sem singleton de módulo — cliente criado por-request dentro das funções
const FALLBACK_IMG = '/assets/hero_farm.webp';
const SB_STORAGE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/';

// Regex de validação de UUID v4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Strings específicas desta página (não compartilhadas o bastante pra entrar
// no dicionário global I18N) — "Início" e "Anúncios" (fallback de categoria)
// reaproveitam I18N.nav_home/footer_ads via _t() abaixo.
const PAGE_TEXT: Record<Lang, {
  notFoundTitle: string;
  fallbackTitle: string;
  metaDescFallback: (title: string) => string;
  navAriaLabel: string;
  breadcrumbCurrent: string;
  backToResults: string;
  sellerDescTitle: string;
  tagsTitle: string;
  priceOnRequest: string;
  priceLabel: string;
  talkToSeller: string;
}> = {
  pt: {
    notFoundTitle: 'Anúncio não encontrado',
    fallbackTitle: 'Anúncio',
    metaDescFallback: (title) => `Veja detalhes do anúncio ${title}`,
    navAriaLabel: 'Navegação',
    breadcrumbCurrent: 'Anúncio',
    backToResults: 'Voltar aos resultados',
    sellerDescTitle: 'Descrição do Vendedor',
    tagsTitle: 'Tags',
    priceOnRequest: 'Sob consulta',
    priceLabel: 'Valor sugerido',
    talkToSeller: 'Falar com Vendedor',
  },
  es: {
    notFoundTitle: 'Anuncio no encontrado',
    fallbackTitle: 'Anuncio',
    metaDescFallback: (title) => `Mira los detalles del anuncio ${title}`,
    navAriaLabel: 'Navegación',
    breadcrumbCurrent: 'Anuncio',
    backToResults: 'Volver a los resultados',
    sellerDescTitle: 'Descripción del Vendedor',
    tagsTitle: 'Etiquetas',
    priceOnRequest: 'A consultar',
    priceLabel: 'Valor sugerido',
    talkToSeller: 'Hablar con el Vendedor',
  },
};

async function getCookieLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

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

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { id } = await params;

  // BUG CORRIGIDO (auditoria de i18n, 2026-08-26): generateMetadata nunca
  // lia cookies() nem searchParams — o <title>/description ficavam sempre
  // em pt mesmo com ES selecionado, e os links hreflang ?lang=pt/?lang=es
  // já declarados abaixo eram só decorativos (não influenciavam o próprio
  // meta gerado quando um crawler os seguia). searchParams.lang tem
  // prioridade (é o que o link hreflang carrega); sem ele, cai no cookie
  // tc_lang, igual ao resto do site.
  const sp = await searchParams;
  const spLang = typeof sp?.lang === 'string' ? sp.lang : undefined;
  const lang: Lang = spLang === 'es' || spLang === 'pt' ? spLang : await getCookieLang();
  const tx = PAGE_TEXT[lang];

  if (!UUID_REGEX.test(id)) {
    return { title: tx.notFoundTitle };
  }

  const supabase = createAnonClient();
  const { data: ad } = await supabase
    .from('ads')
    .select('title_pt, title_es, description, images, status')
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();

  // BUG CORRIGIDO (teste completo do site, 2026-08-24): soft-404 — a página
  // sempre respondia HTTP 200 mesmo para um id inexistente (curl confirmou
  // em dev E em build de produção real). Causa: esta rota tem loading.tsx,
  // que envolve o page.tsx num Suspense — o streaming já começa como 200
  // antes do notFound() do corpo da página rodar, e o status não pode mais
  // mudar depois que qualquer HTML foi enviado (comportamento documentado
  // do App Router). generateMetadata roda ANTES do corpo começar a
  // streamar, então chamar notFound() aqui (que já sabia que o anúncio não
  // existe, só nunca chamava) resolve sem precisar remover o skeleton de
  // loading do caminho feliz.
  if (!ad) notFound();

  // BUG CORRIGIDO (auditoria de i18n, 2026-08-26): ordem estava
  // `ad.title_pt || ad.title_es` — nunca usava o título em espanhol mesmo
  // com lang="es" e title_es preenchido. Agora prioriza a coluna do idioma
  // ativo (com fallback pra pt quando a tradução ainda não existe).
  const title = (lang === 'es' && ad.title_es) ? ad.title_es : (ad.title_pt || ad.title_es || tx.fallbackTitle);
  const imgUrl = ad.images?.[0] ? imageUrl(ad.images[0]) : null;
  // Remover tags HTML da description para o meta description
  const plainDescription = (ad.description || '').replace(/<[^>]*>/g, '').substring(0, 160);

  return {
    title: title,
    description: plainDescription || tx.metaDescFallback(title),
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

  const lang = await getCookieLang();
  const tx = PAGE_TEXT[lang];

  // ─── Cliente por-request (sem singleton de módulo) ──────────
  const supabase = createAnonClient();

  const { data: ad } = await supabase
    .from('ads')
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): faltavam
    // email_verified/phone_verified/kyc_status — AdSidebar.tsx usa esses 3
    // campos pra decidir se mostra os selos de e-mail/telefone/identidade
    // verificados, que por isso nunca apareciam mesmo com o vendedor
    // realmente verificado no banco.
    .select('*, profiles(id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at, email_verified, phone_verified, kyc_status), categories(name_pt, name_es, icon)')
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

  // BUG CORRIGIDO (auditoria de i18n, 2026-08-26): mesma inversão de
  // prioridade do generateMetadata — título e nome da categoria exibidos
  // no corpo da página (breadcrumb, galeria, JSON-LD, sidebar) ignoravam
  // completamente o idioma ativo.
  const adTitle = (lang === 'es' && ad.title_es) ? ad.title_es : (ad.title_pt || ad.title_es || tx.fallbackTitle);
  const catName = lang === 'es'
    ? (ad.categories?.name_es || ad.categories?.name_pt || '')
    : (ad.categories?.name_pt || ad.categories?.name_es || '');
  // Mesmo padrão já correto de components/ads/AdCard.tsx pra tags_es
  // (coluna adicionada na migration de i18n — texto livre digitado pelo
  // vendedor, sem tradução automática, por isso o fallback pra tags_pt).
  const tags = lang === 'es' && ad.tags_es && ad.tags_es.length > 0 ? ad.tags_es : ad.tags_pt;

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

  // GAP DE SEGURANÇA CORRIGIDO (2026-08-25): o painel lateral no desktop
  // lia profiles.phone_whatsapp direto do objeto `ad`, serializado pro
  // client component <AdSidebar> — expondo o WhatsApp do vendedor no
  // HTML/RSC payload pra QUALQUER visitante sem login, mesmo o dado
  // sendo protegido com autenticação, rate limit e verificação de origin
  // no CTA mobile via /api/contact-seller. Agora só um booleano
  // (hasWhatsapp) atravessa pro client; o número em si nunca sai do
  // servidor, e o botão do desktop passa a usar a mesma rota protegida.
  const { phone_whatsapp, ...profilesWithoutPhone } = ad.profiles ?? {};
  const hasWhatsapp = !!phone_whatsapp;
  const adForSidebar = { ...ad, profiles: ad.profiles ? profilesWithoutPhone : null };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
      />
      <RecentViewTracker ad={adForSidebar} />

      {/* BREADCRUMB */}
      <div className="page-header ad-page-header">
        <div className="ad-page-header-pattern"></div>
        <div className="container ad-breadcrumb-container">
          <nav className="breadcrumb ad-breadcrumb-nav" aria-label={tx.navAriaLabel}>
            <Link href="/">{_t('nav_home', lang)}</Link>
            <span aria-hidden>›</span>
            <Link href={`/listagem${ad.category_id ? `?categoria=${ad.category_id}` : ''}`}>
              {catName || _t('footer_ads', lang)}
            </Link>
            <span aria-hidden>›</span>
            <strong className="ad-breadcrumb-current">{tx.breadcrumbCurrent}</strong>

            <div className="ad-breadcrumb-actions">
              <ShareButton title={adTitle} text={(ad.description || '').replace(/<[^>]*>/g, '').substring(0, 80)} />
              <Link href="/listagem" className="ad-breadcrumb-back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                {tx.backToResults}
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
                <h3 className="ad-details-title">{tx.sellerDescTitle}</h3>
                <div
                  className="desc-text text-gray-500 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: safeDescription }}
                />
              </div>
            )}

            {tags && tags.length > 0 && (
              <div className="details-section ad-details-section" style={{ border: 'none', boxShadow: 'none', marginTop: '1.5rem' }}>
                <h3 className="ad-details-title">{tx.tagsTitle}</h3>
                <div className="product-tags ad-tags-container">
                  {tags.map((tag: string) => (
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
          <AdSidebar ad={adForSidebar} adTitle={adTitle} catName={catName} hasWhatsapp={hasWhatsapp} />
        </div>
      </div>

      {/* STICKY CTA MOBILE */}
      <div className="sticky-cta-mobile">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="ad-mobile-cta-price-label">{tx.priceLabel}</span>
            <strong className="ad-mobile-cta-price-value">
              {ad.price
                ? new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'pt-BR', { style: 'currency', currency: ad.currency || 'BRL' }).format(ad.price)
                : tx.priceOnRequest /* BUG CORRIGIDO (reteste, 2026-08-25): 2ª ocorrência do texto de preço nulo, diferente do painel lateral — unificado */}
            </strong>
          </div>
          <a
            href={`/api/contact-seller?adId=${ad.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--accent ad-mobile-cta-button"
          >
            {tx.talkToSeller}
          </a>
        </div>
      </div>
    </>
  );
}
