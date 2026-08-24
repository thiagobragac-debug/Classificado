import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createAnonClient } from '@/lib/supabase-server';
import LotGrid from '@/components/auctions/LotGrid';
import { LotData } from '@/components/auctions/LotBiddingModal';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const revalidate = 30; // ISR 30 segundos — balance entre frescor e caching

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return { title: 'Leilão não encontrado' };

  const sb = createAnonClient();
  const { data } = await sb
    .from('auction_events')
    .select('title, cover, date, status')
    .eq('id', id)
    .single();

  if (!data) return { title: 'Leilão não encontrado' };

  const coverUrl = data.cover
    ? data.cover.startsWith('http')
      ? data.cover
      : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${data.cover}`
    : undefined;

  const description = `Leilão em ${new Date(data.date).toLocaleDateString('pt-BR')} às ${new Date(data.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const isLive = data.status === 'live';
  const ogTitle = isLive ? `AO VIVO: ${data.title}` : data.title;

  return {
    title: data.title,
    description,
    alternates: { canonical: `https://tauzeclass.com.br/leiloes/${id}` },
    openGraph: {
      title: ogTitle,
      description,
      url: `https://tauzeclass.com.br/leiloes/${id}`,
      type: 'website',
      locale: 'pt_BR',
      images: coverUrl
        ? [{ url: coverUrl, width: 1200, height: 630, alt: data.title }]
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
      .select('id, title, date, cover, status, youtube, catalog')
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
      .select('id, lot_number, title, description, image, video, sire, dam, min_bid, current_bid, auction_id')
      .eq('auction_id', auctionId)
      .order('lot_number', { ascending: true }),
  ]);

  if (error || !auction) {
    notFound();
  }

  const isLive = auction.status === 'live';
  const isScheduled = auction.status === 'scheduled';

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
                  LEILÃO AO VIVO
                </div>
              )}
              {isScheduled && (
                <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', border: '1px solid rgba(59,130,246,0.2)' }}>
                  AGENDADO
                </div>
              )}
              <h1 style={{ fontSize: '2rem', margin: 0, lineHeight: 1.2, color: 'white' }}>{auction.title}</h1>
              <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '1.1rem' }}>
                {new Date(auction.date).toLocaleDateString('pt-BR')} às {new Date(auction.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {auction.catalog && (
              <a href={auction.catalog} target="_blank" rel="noopener noreferrer" className="btn btn--outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Baixar Catálogo
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
                title={`Leilão ao vivo: ${auction.title}`}
              ></iframe>
            </div>
          ) : (
            <div style={{ position: 'relative', height: '400px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a' }}>
              <img
                src={auction.cover || '/assets/hero_farm.webp'}
                alt={`Capa do leilão: ${auction.title}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7)' }}
              />
              {isScheduled && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize: '1.25rem', color: 'white', marginBottom: '1rem', fontWeight: 600, letterSpacing: '0.1em' }}>INICIA EM</div>
                  <div style={{ fontSize: '3rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.1)', padding: '1rem 3rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                    Em Breve
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Lotes */}
        <div>
          <h2 className="section-title">Catálogo de Lotes</h2>
          <LotGrid lots={((lots || []) as unknown as LotData[])} isLive={isLive} userId={userId} />
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
            Patrocine o Leilão
          </a>
        </div>
      </div>
    </>
  );
}
