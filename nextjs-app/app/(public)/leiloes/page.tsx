import { Suspense } from 'react';
import AuctionsBrowser from '@/components/auctions/AuctionsBrowser';
import { createAnonClient } from '@/lib/supabase-server';

export const metadata = {
  title: 'Leilões Virtuais',
  description: 'Acompanhe os próximos leilões virtuais de animais, máquinas e imóveis rurais. Dê seus lances e faça ótimos negócios no Mercosul.',
  alternates: { canonical: 'https://tauzeclass.com.br/leiloes' },
  openGraph: {
    title: 'Leilões Virtuais | Tauze Class',
    description: 'Acompanhe os próximos leilões virtuais de animais, máquinas e imóveis rurais no Mercosul.',
    url: 'https://tauzeclass.com.br/leiloes',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg', width: 1200, height: 630, alt: 'Leilões Agro | Tauze Class' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leilões Virtuais | Tauze Class',
    description: 'Acompanhe os próximos leilões virtuais de animais, máquinas e imóveis rurais.',
    images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
  },
};

export const revalidate = 60; // ISR 1 minuto

function escapeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

async function fetchAuctions(searchParams: any) {
  const params = await searchParams;
  // Sanitizar e limitar parâmetros de entrada
  const status = typeof params?.status === 'string' ? params.status.slice(0, 20) : 'active';
  const q = typeof params?.q === 'string' ? params.q.trim().slice(0, 100) : undefined;
  const month = typeof params?.month === 'string' ? params.month.slice(0, 10) : undefined;

  const sb = createAnonClient();

  // Selecionar apenas as colunas necessárias para o card
  let query = sb.from('auction_events').select('id, title, date, cover, status, youtube, catalog');

  if (status === 'active') {
    query = query.in('status', ['live', 'scheduled']);
  } else if (status === 'closed') {
    query = query.in('status', ['finished']);
  } else if (status === 'todos') {
    query = query.in('status', ['live', 'scheduled', 'finished']);
  } else {
    // Default fallback
    query = query.in('status', ['live', 'scheduled']);
  }

  if (q && q.length <= 100) {
    // Sanitize special ilike metacharacters before using in pattern match
    const sanitized = q.replace(/[%_\\]/g, '\\$&');
    query = query.ilike('title', `%${sanitized}%`);
  }

  if (month) {
    const parts = month.split('-');
    // Validar partes antes de usar como Date (evitar Date injection)
    if (parts.length >= 3 && parts.every((p: string) => /^\d+$/.test(p))) {
      // YYYY-MM-DD (Filtrar leilões a partir desta data)
      const startOfDay = new Date(
        parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])
      ).toISOString();
      query = query.gte('date', startOfDay);
    } else if (parts.length === 2 && parts.every((p: string) => /^\d+$/.test(p))) {
      // YYYY-MM (Filtrar mês inteiro)
      const startOfMonth = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1).toISOString();
      const endOfMonth = new Date(parseInt(parts[0]), parseInt(parts[1]), 0, 23, 59, 59).toISOString();
      query = query.gte('date', startOfMonth).lte('date', endOfMonth);
    }
  }

  query = query.order('date', { ascending: true }).limit(100);

  const { data, error } = await query;

  if (error) {
    console.error('[leiloes] Failed to fetch auctions:', error?.message || error);
    return [];
  }

  return data || [];
}

export default async function LeiloesPage({ searchParams }: { searchParams: Promise<any> }) {
  const events = await fetchAuctions(searchParams);

  const ORGANIZER = {
    '@type': 'Organization',
    name: 'Tauze Class',
    url: 'https://tauzeclass.com.br',
  } as const;

  const jsonLdArray = {
    '@context': 'https://schema.org',
    '@graph': events.map((ev: any) => {
      const startDate = ev.date;
      const endDate = new Date(new Date(ev.date).getTime() + 4 * 60 * 60 * 1000).toISOString();
      const isOnline = !ev.location || ev.location.toLowerCase().includes('online');
      return {
        '@type': 'Event',
        name: ev.title,
        startDate,
        endDate,
        url: `https://tauzeclass.com.br/leiloes/${ev.id}`,
        eventAttendanceMode: isOnline
          ? 'https://schema.org/OnlineEventAttendanceMode'
          : 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus:
          ev.status === 'live'
            ? 'https://schema.org/EventScheduled'
            : ev.status === 'finished'
            ? 'https://schema.org/EventCancelled'
            : 'https://schema.org/EventScheduled',
        location: isOnline
          ? { '@type': 'VirtualLocation', url: `https://tauzeclass.com.br/leiloes/${ev.id}` }
          : {
              '@type': 'Place',
              name: ev.location || 'Local do Leilão',
              address: {
                '@type': 'PostalAddress',
                addressLocality: ev.location || 'Brasil',
                addressCountry: 'BR',
              },
            },
        description: ev.description || ev.title,
        image: ev.cover
          ? ev.cover.startsWith('http')
            ? ev.cover
            : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${ev.cover}`
          : 'https://tauzeclass.com.br/assets/hero_farm.webp',
        organizer: ORGANIZER,
      };
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLdArray) }}
      />
      <Suspense
        fallback={
          <div className="container skeleton-listagem-container" style={{ minHeight: '60vh' }}>
            <div className="skeleton-hero-right" style={{ height: '400px', marginBottom: '2rem' }}></div>
            <div className="skeleton-listagem-grid-outer">
              <div className="skeleton-listagem-grid-inner">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton-listagem-card" aria-hidden="true"></div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <AuctionsBrowser events={events} />
      </Suspense>
    </>
  );
}
