import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

export interface AuctionEvent {
  id: string
  title: string
  location: string
  date: string
  cover?: string
  status?: string
}

interface EventCardProps {
  ev: AuctionEvent
}

export default function EventCard({ ev }: EventCardProps) {
  return (
    <Link href={`/eventos/${ev.id}`} className="event-card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', width: '100%', height: '200px', backgroundColor: '#f1f5f9' }}>
        <Image 
          src={ev.cover || 'https://via.placeholder.com/400x300'} 
          alt={ev.title}
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
      <div className="event-card-body">
        <div className="event-card-tag">Destaque Oficial</div>
        <h3 className="event-card-title">{ev.title}</h3>
        
        <div className="event-card-info" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {new Date(ev.date).toLocaleDateString('pt-BR')}
        </div>
        <div className="event-card-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          {ev.location || 'Online'}
        </div>
      </div>
    </Link>
  )
}
