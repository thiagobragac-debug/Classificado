import React from 'react';
import Link from 'next/link';
import EventCard, { AuctionEvent } from '@/app/(public)/eventos/EventCard';

interface EventsAuctionsSectionProps {
  events: AuctionEvent[];
}

export function EventsAuctionsSection({ events }: EventsAuctionsSectionProps) {
  if (!events || events.length === 0) return null;

  return (
    <section className="events-section" style={{ padding: '3rem 0', background: 'var(--clr-surface-alt)', marginBottom: 0 }}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
          <div>
            <h2 className="section-title" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--clr-heading)', marginBottom: '0.5rem' }}>
              Próximos Eventos & Leilões
            </h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: '1.1rem' }}>
              Acompanhe as principais feiras e remates do agronegócio
            </p>
          </div>
          <Link href="/eventos" className="btn btn--outline" style={{ display: 'none' }}>
            Ver agenda completa
          </Link>
        </div>

        <div className="events-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
          gap: '2rem' 
        }}>
          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
          <Link href="/eventos" className="btn btn--outline" style={{ padding: '0.75rem 2rem', fontWeight: 600 }}>
            Carregar mais
          </Link>
        </div>
      </div>
    </section>
  );
}
