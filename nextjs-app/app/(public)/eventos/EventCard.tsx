import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

export interface AuctionEvent {
  id: string
  title: string
  location?: string
  date: string
  cover?: string
  status?: string
  description?: string
}

interface EventCardProps {
  ev: AuctionEvent
}

export default function EventCard({ ev }: EventCardProps) {
  let day = '--';
  let month = 'TBD';

  if (ev.date && !isNaN(new Date(ev.date).getTime())) {
    // É uma data ISO válida (usada nos Leilões)
    const dateObj = new Date(ev.date);
    day = dateObj.getDate().toString().padStart(2, '0');
    month = dateObj.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  } else if (ev.date && typeof ev.date === 'string') {
    // É uma string de texto (usada nas Feiras/Eventos, ex: "30 ago - 7 set 2026")
    const match = ev.date.match(/(\d+)\s+([a-zA-Zç]+)/i);
    if (match) {
      day = match[1].padStart(2, '0');
      month = match[2].substring(0, 3).toUpperCase();
    }
  }

  return (
    <Link href={`/eventos/${ev.id}`} className="event-card glass-card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', height: '100%', transition: 'transform 0.2s, box-shadow 0.2s' }}>
      <div style={{ position: 'relative', width: '100%', height: '220px', backgroundColor: '#f1f5f9' }}>
        <Image 
          src={ev.cover || '/assets/hero_farm.webp'} 
          alt={ev.title}
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(15,23,42,0.8) 100%)' }}></div>
        {/* Date Badge */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'white', borderRadius: 'var(--r-md)', padding: '6px 12px', textAlign: 'center', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', minWidth: '56px' }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 800, color: 'var(--clr-primary)', lineHeight: 1 }}>{day}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{month}</span>
        </div>
        {/* Fallback description overlay */}
        <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', color: 'white', fontSize: 'var(--fs-sm)', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          {ev.description || 'Confira os detalhes deste grande evento do Agronegócio.'}
        </div>
      </div>
      <div className="event-card-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div className="event-card-tag" style={{ background: 'var(--clr-primary-pale)', color: 'var(--clr-primary)', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Destaque Oficial</div>
          {ev.status === 'Ao Vivo' && (
             <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
               <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
               Ao Vivo
             </div>
          )}
        </div>
        <h3 className="event-card-title" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.title}</h3>
        
        <div className="event-card-info" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--clr-text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.location || 'Local a definir'}</span>
        </div>
      </div>
    </Link>
  )
}
