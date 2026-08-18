import React from 'react'
import { createAnonClient } from '@/lib/supabase-server'
import EventCard, { AuctionEvent } from './EventCard'
import EventSearch from './EventSearch'
import Link from 'next/link'

export const revalidate = 3600; // ISR — página de eventos raramente muda

export const metadata = {
  title: 'Agenda de Eventos | Tauze Class',
  description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul. Agenda completa de eventos rurais no Brasil, Argentina, Paraguai e Uruguai.',
  alternates: { canonical: 'https://tauzeclass.com.br/eventos' },
  openGraph: {
    title: 'Agenda de Eventos | Tauze Class',
    description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul.',
    url: 'https://tauzeclass.com.br/eventos',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg', width: 1200, height: 630, alt: 'Agenda de Eventos Agro | Tauze Class' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agenda de Eventos | Tauze Class',
    description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul.',
    images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
  },
}

function escapeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const query = await searchParams
  // Sanitizar e limitar comprimento da query de busca
  const rawSearch = typeof query?.q === 'string' ? query.q : ''
  const searchQuery = rawSearch.trim().slice(0, 100) // máximo 100 chars

  const sb = createAnonClient();

  let events: AuctionEvent[] = []

  try {
    // Selecionar as colunas necessárias para renderização correta
    let qAuctions = sb.from('auction_events')
      .select('id, title, date, cover, status')
      .neq('status', 'draft')
      .limit(50)

    let qEventos = sb.from('eventos')
      .select('id, title, date, image, location_str')
      .limit(50)

    if (searchQuery) {
      qAuctions = qAuctions.ilike('title', `%${searchQuery}%`)
      qEventos = qEventos.ilike('title', `%${searchQuery}%`)
    }

    const [resAuctions, resEventos] = await Promise.all([qAuctions, qEventos])

    if (resAuctions.error) throw resAuctions.error
    if (resEventos.error) throw resEventos.error

    const normalizedAuctions = (resAuctions.data || []).map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      cover: a.cover,
      status: a.status,
      location: undefined
    }));

    const normalizedEventos = (resEventos.data || []).map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      cover: e.image,
      location: e.location_str
    }));

    events = [...normalizedAuctions, ...normalizedEventos];

    events.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      const validA = !isNaN(timeA) ? timeA : Date.now() + 86400000;
      const validB = !isNaN(timeB) ? timeB : Date.now() + 86400000;
      return validA - validB;
    });

  } catch (err) {
    console.error('Erro ao carregar eventos:', err)
  }

  const ORGANIZER = {
    '@type': 'Organization',
    name: 'Tauze Class',
    url: 'https://tauzeclass.com.br',
  } as const;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': events.map(ev => {
      let startDateStr = ev.date;
      let endDateStr = ev.date;
      const parsedDate = new Date(ev.date);

      if (!isNaN(parsedDate.getTime())) {
        startDateStr = parsedDate.toISOString();
        endDateStr = new Date(parsedDate.getTime() + 4 * 60 * 60 * 1000).toISOString();
      } else {
        // Se a data for texto, usa fallback pra hoje (necessário para o JSON-LD ser válido)
        const fallback = new Date();
        startDateStr = fallback.toISOString();
        endDateStr = new Date(fallback.getTime() + 86400000).toISOString();
      }

      const isOnline = !ev.location || ev.location.toLowerCase().includes('online');
      return {
        '@type': 'Event',
        name: ev.title,
        startDate: startDateStr,
        endDate: endDateStr,
        url: `https://tauzeclass.com.br/eventos/${ev.id}`,
        eventAttendanceMode: isOnline
          ? 'https://schema.org/OnlineEventAttendanceMode'
          : 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: isOnline
          ? { '@type': 'VirtualLocation', url: `https://tauzeclass.com.br/eventos/${ev.id}` }
          : {
              '@type': 'Place',
              name: ev.location || 'Local do Evento',
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
            : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/${ev.cover}`
          : 'https://tauzeclass.com.br/assets/hero_farm.webp',
        organizer: ORGANIZER,
      };
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLdGraph) }}
      />
      <main className="flex-1 pb-16" style={{ marginTop: 'var(--header-h)', background: 'var(--clr-bg-alt)' }}>
        <div className="list-hero" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
          <div className="container">
            <div className="list-hero-inner">
              <div>
                <nav aria-label="Breadcrumb" className="breadcrumb">
                  <Link href="/">Início</Link>
                  <span aria-hidden="true">›</span>
                  <span aria-current="page">Agenda de Eventos</span>
                </nav>
                <h1 className="list-hero-title">Agenda de Eventos</h1>
                <p className="list-hero-count">Descubra as maiores feiras, exposições e congressos do Agronegócio.</p>
              </div>

              <EventSearch />
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
          <div className="events-section">
            <h2 className="section-title">Grandes Destaques Nacionais</h2>

            {events.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">
                  Nenhum evento encontrado{searchQuery ? ` para "${searchQuery}"` : ''}.
                </p>
                {searchQuery && (
                  <Link href="/eventos" className="text-green-600 hover:underline font-medium">
                    Limpar busca e ver todos
                  </Link>
                )}
              </div>
            ) : (
              <div className="events-grid">
                {events.map((ev) => (
                  <EventCard key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
