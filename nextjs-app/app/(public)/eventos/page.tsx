'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { detectLocation } from '@/lib/useGeoLocation'

export default function EventosPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLocating, setIsLocating] = useState(false)

  useEffect(() => {
    async function fetchEvents() {
      const sb = getSupabase()
      try {
        const { data } = await sb.from('auction_events')
          .select('*')
          .neq('status', 'draft')
          .order('date', { ascending: true })
          .limit(20)
        
        if (data) {
          setEvents(data)
        }
      } catch (err) {
        console.error('Erro ao carregar eventos:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const handleGetLocation = async () => {
    setIsLocating(true)
    const loc = await detectLocation()
    setIsLocating(false)
    
    if (loc && (loc.city || loc.state)) {
      setSearchQuery(`${loc.city || ''}${loc.city && loc.state ? ', ' : ''}${loc.state || ''}`)
      showToast('Localização detectada com sucesso!', 'success')
    } else {
      showToast('Não foi possível detectar a localização (GPS negado ou IP falhou).', 'error')
    }
  }

  const filteredEvents = events.filter(ev => {
    if (!searchQuery) return true
    const term = searchQuery.toLowerCase()
    return (ev.title?.toLowerCase().includes(term) || ev.location?.toLowerCase().includes(term))
  })

  return (
    <main style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <a href="/">Início</a>
                <span aria-hidden="true">›</span>
                <span>Agenda de Eventos</span>
              </nav>
              <h1 className="list-hero-title">Agenda de Eventos</h1>
              <p className="list-hero-count">Encontre feiras, exposições e congressos do Agronegócio.</p>
            </div>
            
            <div className="hero-search-box" style={{ margin: 0, transform: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '420px', position: 'relative' }}>
              <div className="hero-search-inner">
                <button 
                  className="hero-search-btn" 
                  style={{ background: 'transparent', color: 'var(--clr-primary)', boxShadow: 'none', padding: '0 16px', opacity: isLocating ? 0.5 : 1 }} 
                  title="Usar GPS"
                  onClick={handleGetLocation}
                  disabled={isLocating}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </button>
                <input 
                  type="text" 
                  placeholder={isLocating ? "Localizando..." : "Digite sua cidade..."}
                  style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '16px', width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none', outline: 'none' }} 
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={isLocating}
                />
                <button className="hero-search-btn">Buscar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
        <div className="events-section">
          <h2 className="section-title">Grandes Destaques Nacionais</h2>
          
          {loading ? (
            <p style={{ textAlign: 'center', padding: '3rem' }}>Carregando eventos...</p>
          ) : filteredEvents.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '3rem' }}>Nenhum evento encontrado para "{searchQuery}".</p>
          ) : (
            <div className="events-grid">
              {filteredEvents.map((ev) => (
                <div key={ev.id} className="event-card">
                  <img src={ev.cover || 'https://via.placeholder.com/400x300'} alt={ev.title} className="event-card-img" />
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
