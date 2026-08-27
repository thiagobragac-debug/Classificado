import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import EventCard, { AuctionEvent } from '@/app/(public)/eventos/EventCard';
import type { Lang } from '@/lib/constants';

interface EventsAuctionsSectionProps {
  events: AuctionEvent[];
}

const TRANSLATIONS = {
  pt: {
    title: 'Próximos Eventos & Leilões',
    subtitle: 'Acompanhe as principais feiras e remates do agronegócio',
    fullAgenda: 'Ver agenda completa',
    loadMore: 'Carregar mais',
  },
  es: {
    title: 'Próximos Eventos y Remates',
    subtitle: 'Acompaña las principales ferias y remates del agronegocio',
    fullAgenda: 'Ver agenda completa',
    loadMore: 'Cargar más',
  },
};

export async function EventsAuctionsSection({ events }: EventsAuctionsSectionProps) {
  if (!events || events.length === 0) return null;

  const cookieStore = await cookies();
  const lang = ((cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt') as Lang);
  const tt = TRANSLATIONS[lang];

  return (
    <section className="events-section" style={{ padding: '3rem 0', background: 'var(--clr-surface-alt)', marginBottom: 0 }}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
          <div>
            <h2 className="section-title" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--clr-heading)', marginBottom: '0.5rem' }}>
              {tt.title}
            </h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: '1.1rem' }}>
              {tt.subtitle}
            </p>
          </div>
          <Link href="/eventos" className="btn btn--outline" style={{ display: 'none' }}>
            {tt.fullAgenda}
          </Link>
        </div>

        <div className="events-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '2rem'
        }}>
          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev} lang={lang} />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
          <Link href="/eventos" className="btn btn--outline" style={{ padding: '0.75rem 2rem', fontWeight: 600 }}>
            {tt.loadMore}
          </Link>
        </div>
      </div>
    </section>
  );
}
