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
import { createAdminClient } from '@/lib/supabase-admin';
import { getGeoParams } from '@/lib/listagem-utils';
import { t as _t, type Lang } from '@/lib/constants';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';
import { escapeJsonLd } from '@/lib/json-ld';
import '../../anuncio.css';

// Sem singleton de módulo — cliente criado por-request dentro das funções
const FALLBACK_IMG = '/assets/hero_farm.webp';
// BUG CORRIGIDO (auditoria de SEO): og:image/twitter:image exigem URL
// absoluta — usar FALLBACK_IMG (path relativo) direto fazia o card de
// WhatsApp/Facebook não mostrar imagem nenhuma pra anúncio sem foto.
const FALLBACK_IMG_ABSOLUTE = `https://tauzeclass.com.br${FALLBACK_IMG}`;
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
  whatsappUnavailable: string;
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
    whatsappUnavailable: 'WhatsApp não disponível',
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
    whatsappUnavailable: 'WhatsApp no disponible',
  },
};

async function getCookieLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

// BUG CRÍTICO CORRIGIDO (auditoria de SEO): generateMetadata e o corpo da
// página tinham cada um a SUA PRÓPRIA cópia dessa lógica de prioridade
// (searchParams.lang > cookie) — a cópia do corpo (getCookieLang() sozinho,
// sem olhar searchParams) nunca foi atualizada quando a de generateMetadata
// ganhou o searchParams.lang. Resultado: as duas URLs do par hreflang
// (?lang=pt / ?lang=es) tinham título/description diferentes mas o corpo
// (breadcrumb, categoria, tags, JSON-LD) idêntico, sempre no idioma do
// cookie — um hreflang que declara duas versões e serve o mesmo HTML pras
// duas é pior do que não declarar hreflang nenhum. Extraída pra uma função
// só, usada nos dois lugares, pra nunca mais divergir.
function resolveLang(spLang: string | string[] | undefined, cookieLang: Lang): Lang {
  const v = typeof spLang === 'string' ? spLang : undefined;
  return v === 'es' || v === 'pt' ? v : cookieLang;
}

function imageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  if (path.startsWith('http')) return path;
  return SB_STORAGE + path;
}

// BUG CORRIGIDO (auditoria de SEO): title/OG title sem limite (o campo do
// formulário aceita até 100 caracteres) saía cortado no meio da palavra
// pelo Google/redes sociais. Só usado pro <title>/OG — o h1/galeria da
// própria página continua mostrando o título completo.
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

// BUG CORRIGIDO (auditoria de SEO): a meta description só removia tags
// (.replace(/<[^>]*>/g, '')) sem decodificar entidades HTML nem inserir
// espaço ao remover tags de bloco — texto do Quill como
// "<p>Trator ótimo.</p><p>Aceito troca.</p>" virava
// "Trator ótimo.Aceito troca." colado, e "café &amp; grãos" aparecia cru
// com a entidade no snippet do Google/WhatsApp.
function stripHtmlForMeta(html: string, maxLen: number): string {
  const comEspacos = html
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ');
  const semTags = comEspacos.replace(/<[^>]*>/g, '');
  const decodificado = semTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  const colapsado = decodificado.replace(/\s+/g, ' ').trim();
  return colapsado.length > maxLen ? colapsado.slice(0, maxLen - 1).trimEnd() + '…' : colapsado;
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
  const lang: Lang = resolveLang(spLang, await getCookieLang());
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
  const fullTitle = (lang === 'es' && ad.title_es) ? ad.title_es : (ad.title_pt || ad.title_es || tx.fallbackTitle);
  const title = truncate(fullTitle, 60);
  const imgUrl = ad.images?.[0] ? imageUrl(ad.images[0]) : FALLBACK_IMG_ABSOLUTE;
  const plainDescription = stripHtmlForMeta(ad.description || '', 160);

  // BUG CORRIGIDO (auditoria de SEO): canonical era o MESMO literal pras
  // duas variantes de idioma (?lang=pt e ?lang=es geravam o mesmo
  // canonical, sem o parâmetro) — o Google trata canonical como sinal
  // mais forte que hreflang quando os dois divergem, então consolidava
  // tudo na URL sem parâmetro e esvaziava o par hreflang. Cada variante
  // agora aponta pra si mesma; x-default e "es" genérico (não "es-AR" —
  // o site atende Argentina/Uruguai/Paraguai igualmente, sem segmentação
  // por país) substituem o hreflang anterior.
  const baseUrl = `https://tauzeclass.com.br/anuncio/${id}`;
  const canonicalUrl = spLang === 'es' || spLang === 'pt' ? `${baseUrl}?lang=${spLang}` : baseUrl;

  return {
    title: title,
    description: plainDescription || tx.metaDescFallback(title),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'pt-BR': `${baseUrl}?lang=pt`,
        'es': `${baseUrl}?lang=es`,
        'x-default': baseUrl,
      },
    },
    openGraph: {
      title: `${title} | Tauze Class`,
      description: plainDescription,
      images: [{ url: imgUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Tauze Class`,
      images: [imgUrl],
    },
  };
}

export default async function AdDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { id } = await params;

  // ─── Validação de formato UUID ──────────────────────────────
  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  // BUG CRÍTICO CORRIGIDO (auditoria de SEO): ver comentário de
  // resolveLang() acima — o corpo da página precisa da MESMA prioridade
  // (searchParams.lang > cookie) que generateMetadata já usa, senão o
  // par hreflang declarado lá em cima mente pro Google (título muda,
  // corpo não).
  const sp = await searchParams;
  const spLang = typeof sp?.lang === 'string' ? sp.lang : undefined;
  const lang = resolveLang(spLang, await getCookieLang());
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
    //
    // BUG CRÍTICO CORRIGIDO (incidente ao vivo, 2026-08-29): phone_whatsapp
    // foi removida daqui — supabase/migrations/20260829120000_revoke_anon_
    // phone_whatsapp.sql revogou o SELECT dessa coluna pra `anon` (fix de
    // segurança em paralelo, feito por outra sessão), e um GRANT/REVOKE de
    // coluna faltando derruba a query INTEIRA com 42501, não só a coluna —
    // toda página de anúncio virou 404 pra 100% dos visitantes (confirmado
    // ao vivo contra o Postgrest de produção). O valor cru nunca era enviado
    // ao cliente mesmo antes disso (ver desestruturação abaixo) — só o
    // booleano hasWhatsapp precisa da coluna, buscado à parte via
    // service_role logo abaixo, isolado desta query pública.
    .select('*, profiles(id, name, display_name, avatar_url, verified, country, created_at, email_verified, phone_verified, kyc_status), categories(name_pt, name_es, icon)')
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

  // BUG CORRIGIDO (auditoria de SEO): três problemas no Product/Offer:
  //  1. `ad.images?.map(...) || [FALLBACK_IMG]` — array VAZIO (`[]`) é
  //     truthy em JS, então o fallback nunca disparava pra anúncio sem
  //     foto nenhuma; Google trata `image: []` como campo ausente/inválido
  //     e nega elegibilidade a rich result justo nesse caso.
  //  2. `price: ad.price || 0` gravava preço ZERO ("grátis") pra anúncio
  //     "Sob consulta" (sem preço) — dado estruturado contradizendo o que
  //     a própria página mostra. Omite o bloco `offers` inteiro quando não
  //     há preço, em vez de inventar um valor.
  //  3. `itemCondition` sempre fixo em UsedCondition, ignorando
  //     ads.condition (já vinha no select('*'), nunca era lido).
  const temFotos = Array.isArray(ad.images) && ad.images.length > 0;
  const itemCondition = ad.condition === 'novo' || ad.condition === 'new'
    ? 'https://schema.org/NewCondition'
    : 'https://schema.org/UsedCondition';

  // BUG CORRIGIDO (auditoria de SEO, 2ª rodada): breadcrumb visual real já
  // existe (Início > Categoria > Anúncio, ver <nav className="breadcrumb">
  // abaixo) mas nunca tinha o schema.org BreadcrumbList correspondente —
  // rich result de breadcrumb no Google (economiza espaço vertical no
  // resultado de busca, mostra a hierarquia em vez da URL crua).
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: _t('nav_home', lang), item: 'https://tauzeclass.com.br/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: catName || _t('footer_ads', lang),
        item: `https://tauzeclass.com.br/listagem${ad.category_id ? `?categoria=${ad.category_id}` : ''}`,
      },
      { '@type': 'ListItem', position: 3, name: adTitle, item: `https://tauzeclass.com.br/anuncio/${ad.id}` },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: adTitle,
        image: temFotos ? ad.images.map((img: string) => imageUrl(img)) : [FALLBACK_IMG_ABSOLUTE],
        description: stripHtmlForMeta(ad.description || adTitle, 500),
        ...(ad.price ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: ad.currency || 'BRL',
            price: ad.price,
            itemCondition,
            availability: ad.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            seller: {
              '@type': 'Person',
              name: ad.profiles?.display_name || ad.profiles?.name || 'Vendedor',
            },
          },
        } : {}),
      },
      breadcrumbJsonLd,
    ],
  };

  // GAP DE SEGURANÇA CORRIGIDO (2026-08-25): o painel lateral no desktop
  // lia profiles.phone_whatsapp direto do objeto `ad`, serializado pro
  // client component <AdSidebar> — expondo o WhatsApp do vendedor no
  // HTML/RSC payload pra QUALQUER visitante sem login, mesmo o dado
  // sendo protegido com autenticação, rate limit e verificação de origin
  // no CTA mobile via /api/contact-seller. Agora só um booleano
  // (hasWhatsapp) atravessa pro client; o número em si nunca sai do
  // servidor, e o botão do desktop passa a usar a mesma rota protegida.
  //
  // phone_whatsapp não vem mais na query principal (ver comentário acima,
  // incidente 2026-08-29) — buscado à parte via service_role. BUG CORRIGIDO
  // (fechamento pré-produção): a coluna mudou de profiles pra user_secrets
  // (migration 20260829130000); service_role ignora RLS de qualquer forma,
  // só o nome da tabela mudou. O valor em si é descartado logo em seguida;
  // só o booleano sobrevive.
  let hasWhatsapp = false;
  if (ad.profiles?.id) {
    const { data: whatsappRow } = await createAdminClient()
      .from('user_secrets')
      .select('phone_whatsapp')
      .eq('id', ad.profiles.id)
      .maybeSingle();
    hasWhatsapp = !!whatsappRow?.phone_whatsapp;
  }
  const adForSidebar = ad;

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
              <ShareButton title={adTitle} text={(ad.description || '').replace(/<[^>]*>/g, '').substring(0, 80)} lang={lang} />
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
            <AdGallery images={ad.images} videoUrl={ad.video_url} title={adTitle} lang={lang} />

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
                // BUG CORRIGIDO (validação do zero, rodada 6): símbolo de moeda
                // via Intl.NumberFormat variava com o locale de exibição —
                // es-AR não tem símbolo de BRL no CLDR (ver lib/currency.ts).
                ? `${getCurrencySymbol(ad.currency)} ${formatCurrencyAmount(ad.price, lang === 'es' ? 'es' : 'pt')}`
                : tx.priceOnRequest /* BUG CORRIGIDO (reteste, 2026-08-25): 2ª ocorrência do texto de preço nulo, diferente do painel lateral — unificado */}
            </strong>
          </div>
          {hasWhatsapp ? (
            <a
              href={`/api/contact-seller?adId=${ad.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--accent ad-mobile-cta-button"
            >
              {tx.talkToSeller}
            </a>
          ) : (
            // BUG CORRIGIDO (varredura cruzada de cenários): CTA fixo mobile
            // não checava hasWhatsapp antes de abrir o link (diferente do
            // AdSidebar desktop, que já desabilita) — um vendedor sem
            // WhatsApp cadastrado fazia esse botão abrir o JSON cru de erro
            // de /api/contact-seller numa nova aba.
            <button className="btn btn--accent ad-mobile-cta-button" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              {tx.whatsappUnavailable}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
