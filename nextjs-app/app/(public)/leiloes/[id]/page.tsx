import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import LotGrid from '@/components/auctions/LotGrid';
import { LotData } from '@/components/auctions/LotBiddingModal';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';

export const revalidate = 0; // Prevent caching for live auction

export default async function AuctionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auctionId = params.id;
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;

  // Fetch the auction event
  const { data: auction, error } = await supabase
    .from('auction_events')
    .select('*')
    .eq('id', auctionId)
    .single();

  if (error || !auction) {
    notFound();
  }

  // Fetch lots
  const { data: lots } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('auction_id', auctionId)
    .order('lot_number', { ascending: true });

  const isLive = auction.status === 'live';
  const isScheduled = auction.status === 'scheduled';
  
  // Extrai ID do YouTube
  const isYoutube = auction.youtube && (auction.youtube.includes('youtube.com') || auction.youtube.includes('youtu.be'));
  const ytMatch = isYoutube ? auction.youtube.match(/(?:v=|youtu\.be\/)([^&]+)/) : null;
  const ytId = ytMatch ? ytMatch[1] : null;

  return (
    <>
      <main className="container" style={{ paddingTop: 'calc(var(--header-h) + 2rem)', paddingBottom: '4rem' }}>
        
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

          {/* Player or Cover */}
          {isLive && isYoutube && ytId ? (
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px', background: '#000' }}>
              <iframe 
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; encrypted-media"
                allowFullScreen
              ></iframe>
            </div>
          ) : (
            <div style={{ position: 'relative', height: '400px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a' }}>
              <img 
                src={auction.cover || 'https://via.placeholder.com/1200x600'} 
                alt="Capa do Leilão"
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

        {/* Lots List */}
        <div>
          <h2 className="section-title">Catálogo de Lotes</h2>
          <LotGrid lots={(lots as LotData[]) || []} isLive={isLive} userId={userId} />
        </div>

        {/* Patrocine Action */}
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

      </main>
    </>
  );
}
