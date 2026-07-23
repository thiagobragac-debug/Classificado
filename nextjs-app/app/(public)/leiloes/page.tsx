import { Suspense } from 'react';
import AuctionsBrowser from '@/components/auctions/AuctionsBrowser';
import { getSupabase } from '@/lib/supabase';
import styles from './leiloes.module.css';

export const metadata = {
  title: 'Leilões - Tauze Class',
  description: 'Acompanhe os próximos leilões virtuais, dê seus lances e faça ótimos negócios.',
};

export const revalidate = 0; // Ensures the page stays fresh (SSR)

async function fetchAuctions(searchParams: any) {
  // Await searchParams as required in Next.js 15+
  const params = await searchParams;
  const status = params?.status;
  const q = params?.q;
  const month = params?.month;

  const sb = getSupabase();
  let query = sb.from('auction_events').select('*');

  if (status && status !== 'todos') {
    query = query.eq('status', status);
  }
  
  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  if (month) {
    const [year, m] = month.split('-');
    const startOfMonth = new Date(parseInt(year), parseInt(m) - 1, 1).toISOString();
    const endOfMonth = new Date(parseInt(year), parseInt(m), 0, 23, 59, 59).toISOString();
    query = query.gte('date', startOfMonth).lte('date', endOfMonth);
  }

  query = query.order('date', { ascending: true });

  const { data, error } = await query;
  
  if (error) {
    console.error('Failed to fetch auctions:', error);
    return [];
  }
  
  return data || [];
}

export default async function LeiloesPage({ searchParams }: { searchParams: Promise<any> }) {
  const events = await fetchAuctions(searchParams);

  const jsonLd = events.map((ev: any) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    "name": ev.title,
    "startDate": ev.date,
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "VirtualLocation",
      "url": `https://tauzeclass.com.br/leiloes?q=${encodeURIComponent(ev.title)}`
    },
    "description": ev.description || ev.title
  }));

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <Suspense fallback={
      <div className="container" style={{ padding: '6rem 0', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(22, 163, 74, 0.2)', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h2 style={{ color: 'var(--clr-text-muted)', fontSize: '1.2rem', fontWeight: 500 }}>Carregando leilões...</h2>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    }>
      <AuctionsBrowser events={events} />
    </Suspense>
    </>
  );
}
