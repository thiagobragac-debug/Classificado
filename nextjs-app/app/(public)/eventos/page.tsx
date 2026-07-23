import React from 'react'
import { createClient } from '@/lib/supabase-server'
import EventCard, { AuctionEvent } from './EventCard'
import EventSearch from './EventSearch'
import Link from 'next/link'

export const revalidate = 3600; // ISR

export const metadata = {
  title: 'Agenda de Eventos - Classificado',
  description: 'Encontre feiras, exposições e congressos do Agronegócio.',
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const query = await searchParams
  const searchQuery = typeof query?.q === 'string' ? query.q : ''
  const sb = await createClient()

  let events: AuctionEvent[] = []
  
  try {
    let q = sb.from('auction_events')
      .select('*')
      .neq('status', 'draft')
      .order('date', { ascending: true })
      .limit(20)

    if (searchQuery) {
      // Usando or para buscar na cidade ou título
      q = q.or(`title.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`)
    }

    const { data, error } = await q

    if (error) throw error
    if (data) events = data as AuctionEvent[]

  } catch (err) {
    console.error('Erro ao carregar eventos:', err)
  }

  const jsonLd = events.map(ev => ({
    "@context": "https://schema.org",
    "@type": "Event",
    "name": ev.title,
    "startDate": ev.date,
    "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "VirtualLocation",
      "url": `https://tauzeclass.com.br/eventos?q=${encodeURIComponent(ev.title)}`
    },
    "description": ev.description || ev.title
  }));

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <main style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <Link href="/">Início</Link>
                <span aria-hidden="true">›</span>
                <span aria-current="page">Agenda de Eventos</span>
              </nav>
              <h1 className="list-hero-title">Agenda de Eventos</h1>
              <p className="list-hero-count">Encontre feiras, exposições e congressos do Agronegócio.</p>
            </div>
            
            <EventSearch />
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
        <div className="events-section">
          <h2 className="section-title">Grandes Destaques Nacionais</h2>
          
          {events.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '3rem' }}>Nenhum evento encontrado{searchQuery ? ` para "${searchQuery}"` : ''}.</p>
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
