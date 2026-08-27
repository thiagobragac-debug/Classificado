import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { createClient, createAnonClient } from '@/lib/supabase-server';
import LotGrid from '@/components/auctions/LotGrid';
import { LotData } from '@/components/auctions/LotBiddingModal';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// BUG CORRIGIDO (auditoria de i18n, 2026-08-26/27 — confirmado ao vivo
// contra o servidor real, inspecionando os headers da resposta): esta rota
// combina generateStaticParams() com `revalidate`, o que faz o Next.js
// cachear o HTML gerado (ISR, x-nextjs-cache: HIT / x-nextjs-prerender: 1)
// e servir o MESMO HTML pra todo mundo dentro da janela de revalidação,
// independente do cookie tc_lang de quem está pedindo a página — a leitura
// de cookies() aqui (generateMetadata e no corpo da página) fica presa no
// idioma de quem quer que tenha disparado a última regeneração. Confirmado:
// /leiloes/[id] alternava PT/ES de forma inconsistente entre navegações
// enquanto /leiloes (sem generateStaticParams, sempre dinâmica por causa de
// searchParams) trocava de idioma corretamente em toda navegação. Trocar
// pra force-dynamic garante que cookies() seja lido de verdade a cada
// request, igual ao comportamento documentado do Next — troca o ganho de
// prerender por corretude de i18n (que é o que esta rodada existe pra
// garantir). generateStaticParams() continua declarado abaixo, mas deixa de
// disparar prerender/ISR nesta config.
export const dynamic = 'force-dynamic';

// Strings de UI deste Server Component. Padrão pt/es puro (sem hooks —
// consistente com o dicionário local já usado em componentes client como
// components/ads/AdsSidebar.tsx), mas indexado direto por `lang` lido do
// cookie tc_lang (BUG CORRIGIDO — auditoria de i18n, 2026-08-26/27: a
// página inteira era 100% sem cookies(), sempre em português).
const TRANSLATIONS = {
  pt: {
    notFound: 'Leilão não encontrado',
    liveBadge: 'LEILÃO AO VIVO',
    scheduledBadge: 'AGENDADO',
    cancelledBadge: 'LEILÃO CANCELADO',
    downloadCatalog: 'Baixar Catálogo',
    startsIn: 'INICIA EM',
    comingSoon: 'Em Breve',
    lotsCatalog: 'Catálogo de Lotes',
    sponsorAuction: 'Patrocine o Leilão',
    dateTimeConnector: 'às',
    liveVideoTitle: (title: string) => `Leilão ao vivo: ${title}`,
    coverAlt: (title: string) => `Capa do leilão: ${title}`,
    descriptionText: (date: string, time: string) => `Leilão em ${date} às ${time}`,
    liveOgPrefix: (title: string) => `AO VIVO: ${title}`,
  },
  es: {
    notFound: 'Remate no encontrado',
    liveBadge: 'REMATE EN VIVO',
    scheduledBadge: 'PROGRAMADO',
    cancelledBadge: 'REMATE CANCELADO',
    downloadCatalog: 'Descargar Catálogo',
    startsIn: 'COMIENZA EN',
    comingSoon: 'Próximamente',
    lotsCatalog: 'Catálogo de Lotes',
    sponsorAuction: 'Patrociná el Remate',
    dateTimeConnector: 'a las',
    liveVideoTitle: (title: string) => `Remate en vivo: ${title}`,
    coverAlt: (title: string) => `Portada del remate: ${title}`,
    descriptionText: (date: string, time: string) => `Remate el ${date} a las ${time}`,
    liveOgPrefix: (title: string) => `EN VIVO: ${title}`,
  },
} as const;

async function getLang(): Promise<'pt' | 'es'> {
  return (await cookies()).get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lang = await getLang();
  const T = TRANSLATIONS[lang];
  if (!UUID_REGEX.test(id)) return { title: T.notFound };

  const sb = createAnonClient();
  const { data } = await sb
    .from('auction_events')
    .select('title, title_es, cover, date, status')
    .eq('id', id)
    .single();

  if (!data) return { title: T.notFound };

  const title = lang === 'es' && data.title_es ? data.title_es : data.title;

  const coverUrl = data.cover
    ? data.cover.startsWith('http')
      ? data.cover
      : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${data.cover}`
    : undefined;

  const dateLocale = lang === 'es' ? 'es-AR' : 'pt-BR';
  const description = T.descriptionText(
    new Date(data.date).toLocaleDateString(dateLocale),
    new Date(data.date).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
  );

  const isLive = data.status === 'live';
  const ogTitle = isLive ? T.liveOgPrefix(title) : title;

  return {
    title,
    description,
    alternates: { canonical: `https://tauzeclass.com.br/leiloes/${id}` },
    openGraph: {
      title: ogTitle,
      description,
      url: `https://tauzeclass.com.br/leiloes/${id}`,
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      images: coverUrl
        ? [{ url: coverUrl, width: 1200, height: 630, alt: title }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

// Pré-renderizar os próximos 20 leilões agendados ou ao vivo
export async function generateStaticParams() {
  try {
    const sb = createAnonClient();
    const { data } = await sb
      .from('auction_events')
      .select('id')
      .in('status', ['live', 'scheduled'])
      .order('date', { ascending: true })
      .limit(20);

    return (data || []).map(ev => ({ id: ev.id }));
  } catch {
    return [];
  }
}


export default async function AuctionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auctionId = params.id;
  const lang = await getLang();
  const T = TRANSLATIONS[lang];
  const dateLocale = lang === 'es' ? 'es-AR' : 'pt-BR';

  // Validar formato UUID antes de qualquer query
  if (!UUID_REGEX.test(auctionId)) {
    notFound();
  }

  // Usar createClient para obter sessão do usuário (necessário para bids)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // Buscar leilão e lotes em paralelo para melhor performance
  const [
    { data: auction, error },
    { data: lots },
  ] = await Promise.all([
    supabase
      .from('auction_events')
      // BUG CORRIGIDO (3ª varredura): não buscava a coluna `step` — o valor
      // real de incremento mínimo exigido pelo servidor
      // (place_lot_bid_atomic: lance >= currentBid + step) nunca chegava à
      // UI, que calculava os "lances rápidos" só a partir do current_bid.
      // title_es: coluna nova (auditoria de i18n, 2026-08-26/27), fallback pra title.
      .select('id, title, title_es, date, cover, status, youtube, catalog, step')
      .eq('id', auctionId)
      .single(),
    supabase
      .from('auction_lots')
      // BUG CORRIGIDO: pedia colunas que não existem (images, starting_bid,
      // status — nomes reais são image, min_bid; status nem existe nesta
      // tabela). PostgREST rejeita a consulta inteira com 400 quando um
      // select referencia uma coluna inexistente, então { data: lots } sempre
      // vinha vazio e a página mostrava "Nenhum lote cadastrado" mesmo
      // quando existiam lotes reais — o erro nem era logado, só a
      // desestruturação `{ data: lots }` descartava o error.
      // BUG CORRIGIDO (3ª varredura): não buscava winner_id — a coluna já
      // existe e é populada por place_lot_bid_atomic, mas o lado público
      // nunca mostrava "você está vencendo" (só o admin usava essa coluna).
      // title_es/description_es/sire_es/dam_es: colunas novas (auditoria de
      // i18n, 2026-08-26/27) — LotGrid/LotBiddingModal (client) escolhem a
      // coluna certa sozinhos via useLang(), com fallback pras colunas _pt.
      .select('id, lot_number, title, title_es, description, description_es, image, video, sire, sire_es, dam, dam_es, min_bid, current_bid, winner_id, auction_id')
      .eq('auction_id', auctionId)
      .order('lot_number', { ascending: true }),
  ]);

  if (error || !auction) {
    notFound();
  }

  const auctionTitle = lang === 'es' && auction.title_es ? auction.title_es : auction.title;

  const isLive = auction.status === 'live';
  const isScheduled = auction.status === 'scheduled';
  const isCancelled = auction.status === 'cancelled';

  // Extrai ID do YouTube com validação mais rigorosa
  const isYoutube = auction.youtube &&
    (auction.youtube.includes('youtube.com') || auction.youtube.includes('youtu.be'));
  const ytMatch = isYoutube
    ? auction.youtube.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    : null;
  const ytId = ytMatch ? ytMatch[1] : null;

  return (
    <>
      <div className="container" style={{ paddingTop: 'calc(var(--header-h) + 2rem)', paddingBottom: '4rem' }}>

        {/* Banner/Header */}
        <div style={{ background: '#020617', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '3rem' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              {isLive && (
                <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="live-indicator" style={{ marginRight: '8px' }}></span>
                  {T.liveBadge}
                </div>
              )}
              {isScheduled && (
                <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', border: '1px solid rgba(59,130,246,0.2)' }}>
                  {T.scheduledBadge}
                </div>
              )}
              {isCancelled && (
                <div style={{ display: 'inline-block', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {T.cancelledBadge}
                </div>
              )}
              <h1 style={{ fontSize: '2rem', margin: 0, lineHeight: 1.2, color: 'white' }}>{auctionTitle}</h1>
              <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '1.1rem' }}>
                {new Date(auction.date).toLocaleDateString(dateLocale)} {T.dateTimeConnector} {new Date(auction.date).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {auction.catalog && (
              <a href={auction.catalog} target="_blank" rel="noopener noreferrer" className="btn btn--outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {T.downloadCatalog}
              </a>
            )}
          </div>

          {/* Player ou Capa */}
          {isLive && isYoutube && ytId ? (
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px', background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={T.liveVideoTitle(auctionTitle)}
              ></iframe>
            </div>
          ) : (
            <div style={{ position: 'relative', height: '400px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a' }}>
              <img
                src={auction.cover || '/assets/hero_farm.webp'}
                alt={T.coverAlt(auctionTitle)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7)' }}
              />
              {isScheduled && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize: '1.25rem', color: 'white', marginBottom: '1rem', fontWeight: 600, letterSpacing: '0.1em' }}>{T.startsIn}</div>
                  <div style={{ fontSize: '3rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.1)', padding: '1rem 3rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                    {T.comingSoon}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Lotes */}
        <div>
          <h2 className="section-title">{T.lotsCatalog}</h2>
          <LotGrid
            lots={((lots || []) as unknown as LotData[])}
            isLive={isLive}
            isCancelled={isCancelled}
            userId={userId}
            step={auction.step || 0}
            auctionId={auctionId}
          />
        </div>

        {/* Patrocínio */}
        <div style={{ marginTop: '4rem', textAlign: 'center' }}>
          <a href="/suporte?assunto=patrocinio" className="btn" style={{
            display: 'block',
            width: '100%',
            background: 'var(--clr-primary)',
            color: 'white',
            fontSize: '2rem',
            fontWeight: 700,
            padding: '1.5rem',
            borderRadius: '12px',
            textDecoration: 'none',
            boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.2), 0 2px 4px -2px rgba(22, 163, 74, 0.2)'
          }}>
            {T.sponsorAuction}
          </a>
        </div>
      </div>
    </>
  );
}
