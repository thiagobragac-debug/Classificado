'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';

export interface AuctionEvent {
  id: string;
  title: string;
  date: string;
  status: 'live' | 'scheduled' | 'closed' | string;
  youtube: string | null;
  cover: string | null;
  catalog: string | null;
}

export default function AuctionsBrowser() {
  const { lang, t } = useLang();
  const [events, setEvents] = useState<AuctionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [monthFilter, setMonthFilter] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const sb = getSupabase();
    
    let q = sb.from('auction_events').select('*');

    if (statusFilter !== 'todos') {
      q = q.eq('status', statusFilter);
    }
    
    if (searchQuery) {
      q = q.ilike('title', `%${searchQuery}%`);
    }

    if (monthFilter) {
      const [year, month] = monthFilter.split('-');
      const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
      const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59).toISOString();
      q = q.gte('date', startOfMonth).lte('date', endOfMonth);
    }

    q = q.order('date', { ascending: true });

    const { data, error } = await q;
    if (!error && data) {
      setEvents(data as AuctionEvent[]);
    }
    setLoading(false);
  }, [statusFilter, searchQuery, monthFilter]);

  const [timeNow, setTimeNow] = useState(new Date());

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(() => setTimeNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  const heroEvents = events.filter(ev => ev.status === 'active' || ev.status === 'live' || ev.status === 'scheduled');
  const heroEvent = heroEvents[currentHeroIndex];

  const nextHero = () => setCurrentHeroIndex(prev => (prev + 1) % heroEvents.length);
  const prevHero = () => setCurrentHeroIndex(prev => (prev - 1 + heroEvents.length) % heroEvents.length);

  const getEventState = (ev: AuctionEvent) => {
    if (ev.status === 'closed') return { isClosed: true, isLive: false, isScheduled: false };
    if (ev.status === 'live') return { isClosed: false, isLive: true, isScheduled: false };
    if (ev.status === 'scheduled') return { isClosed: false, isLive: false, isScheduled: true };
    
    const evDate = new Date(ev.date).getTime();
    const now = new Date().getTime();
    if (evDate > now) {
      return { isClosed: false, isLive: false, isScheduled: true };
    } else {
      return { isClosed: false, isLive: true, isScheduled: false };
    }
  };

  const renderCountdown = (targetDateStr: string) => {
    const diff = new Date(targetDateStr).getTime() - timeNow.getTime();
    if (diff <= 0) return null;
    
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);
    
    return (
      <div style={{ display: 'flex', gap: '0.8rem', textAlign: 'center' }}>
        {[
          { label: 'DIAS', value: d },
          { label: 'HORAS', value: h },
          { label: 'MIN', value: m },
          { label: 'SEG', value: s, color: '#ef4444' }
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem 1.2rem', borderRadius: '0.8rem', minWidth: '75px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: item.color || 'white', lineHeight: 1, fontFamily: 'monospace' }}>
                {item.value.toString().padStart(2, '0')}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: item.color || 'var(--clr-primary)', letterSpacing: '1px' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {heroEvent && (
        <section className="page-header" style={{ 
          background: `url(${heroEvent.cover}) center/cover no-repeat, linear-gradient(135deg, #111827, #1f2937)`,
          textAlign: 'left', 
          padding: 'calc(var(--header-h) + 3rem) 0 3rem', 
          position: 'relative', 
          overflow: 'hidden',
          transition: 'background 0.5s ease-in-out'
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(17,24,39,0.95) 0%, rgba(17,24,39,0.7) 50%, rgba(17,24,39,0.4) 100%)', zIndex: 0 }}></div>
          
          <div style={{ maxWidth: '1400px', margin: '0 auto', position: 'relative', width: '100%' }}>
            {heroEvents.length > 1 && (
              <>
                <button onClick={prevHero} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', zIndex: 10, transition: 'background 0.3s' }} aria-label="Anterior">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button onClick={nextHero} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', zIndex: 10, transition: 'background 0.3s' }} aria-label="Próximo">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </>
            )}

            <div className="container" style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem', maxWidth: '1200px', margin: '0 auto', minHeight: '240px' }}>
              <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: getEventState(heroEvent).isLive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.1)', border: `1px solid ${getEventState(heroEvent).isLive ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.2)'}`, color: getEventState(heroEvent).isLive ? '#ef4444' : 'white', padding: '0.3rem 0.8rem', borderRadius: '2rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.75rem' }}>
                    {getEventState(heroEvent).isLive ? <><span className="live-indicator"></span> Transmissão Ao Vivo</> : 'Evento Agendado'}
                  </div>
                </div>
                <h1 style={{ fontSize: '2.2rem', marginBottom: '0.2rem', color: 'white' }}>{heroEvent.title}</h1>
                <p style={{ fontSize: '1rem', maxWidth: '500px', color: 'rgba(255,255,255,0.7)', marginBottom: '0' }}>Acompanhe os melhores lotes e dê seu lance em tempo real.</p>
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <Link href={`/leiloes/${heroEvent.id}`} className="btn btn--outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>Acessar Leilão Completo</Link>
                  {heroEvent.catalog && (
                    <a href={heroEvent.catalog} target="_blank" rel="noopener noreferrer" className="btn btn--accent" style={{ background: '#10b981', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Baixar Catálogo
                    </a>
                  )}
                </div>
              </div>
            
              <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', boxShadow: '0 15px 35px rgba(0,0,0,0.2)', position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <h3 style={{ marginBottom: '1rem', color: 'white', fontSize: '1rem', textAlign: 'center', fontWeight: 600 }}>{getEventState(heroEvent).isLive ? 'O leilão está acontecendo agora!' : 'Tempo restante:'}</h3>
                  {getEventState(heroEvent).isScheduled && renderCountdown(heroEvent.date)}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

    <main className="container" style={{ paddingTop: heroEvent ? '3rem' : 'calc(var(--header-h) + 3rem)', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="section-title">Próximos Leilões</h1>
          <p style={{ color: 'var(--clr-text-light)' }}>Confira o calendário completo de eventos e remates.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', width: '100%', maxWidth: '650px', justifyContent: 'flex-end' }}>
          
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <svg style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input 
              type="text" 
              placeholder="Buscar por raça, fazenda, nome..." 
              className="form-input premium-filter" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
            
          <div className="custom-select-wrapper" style={{ position: 'relative', minWidth: '160px', flexShrink: 0 }}>
            <input 
              type="month" 
              className="form-input premium-filter" 
              style={{ paddingRight: '1.2rem', cursor: 'text' }}
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            />
          </div>
  
          <div className="custom-select-wrapper" style={{ position: 'relative', minWidth: '160px', flexShrink: 0 }}>
            <select 
              className="form-input premium-filter" 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="closed">Encerrados</option>
            </select>
            <svg className="select-icon" style={{ position: 'absolute', right: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>

        </div>
      </div>

      <div className="ads-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {loading ? (
          <p>Carregando leilões...</p>
        ) : events.length === 0 ? (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--clr-text-light)' }}>
            Nenhum leilão encontrado para os filtros selecionados.
          </p>
        ) : (
          events.map(ev => {
            const { isLive, isClosed, isScheduled } = getEventState(ev);
            
            let statusText = 'AGENDADO';
            let statusBg = '#3b82f6';
            let stripeColor = '#3b82f6';
            
            if (isLive) {
              statusText = 'AO VIVO';
              statusBg = '#ef4444';
              stripeColor = '#ef4444';
            } else if (isClosed) {
              statusText = 'ENCERRADO';
              statusBg = '#6b7280';
              stripeColor = '#6b7280';
            }

            const imgFilter = !isLive ? 'grayscale(80%) opacity(0.85)' : 'none';
            const dateObj = new Date(ev.date);
            const formattedDate = dateObj.toLocaleDateString('pt-BR');
            const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return (
              <article key={ev.id} className="ad-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: stripeColor, height: '4px', width: '100%' }}></div>
                <div className="ad-card__image" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: statusBg, color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, zIndex: 10, letterSpacing: '0.05em' }}>
                    {statusText}
                    {isLive && <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#fff', borderRadius: '50%', marginLeft: '6px', animation: 'pulse 1.5s infinite' }}></span>}
                  </div>
                  <img 
                    src={ev.cover || 'https://via.placeholder.com/600x400'} 
                    alt={ev.title} 
                    style={{ width: '100%', height: '220px', objectFit: 'cover', filter: imgFilter, transition: 'transform 0.5s ease' }} 
                  />
                </div>
                
                <div className="ad-card__body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--clr-text-light)', marginBottom: '0.5rem', fontWeight: 600 }}>
                    <span>Data: {formattedDate}</span>
                    <span>Hora: {formattedTime}</span>
                  </div>
                  <h3 className="ad-card__title" style={{ fontSize: '1.25rem', marginBottom: '1.5rem', lineHeight: 1.3 }}>
                    {ev.title}
                  </h3>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <Link href={`/leiloes/${ev.id}`} className="btn btn--accent" style={{ flex: 1, justifyContent: 'center' }}>
                      {isClosed ? 'Ver Resultados' : isLive ? 'Participar' : 'Ver Lotes'}
                    </Link>
                    {!isClosed && (
                      <button 
                        className="btn btn--outline" 
                        aria-label="Lembrar-me" 
                        style={{ padding: '0 1rem' }}
                        onClick={() => {
                          if (Notification.permission === 'default') {
                            Notification.requestPermission().then(p => {
                              if (p === 'granted') alert('Lembrete ativado!');
                            });
                          } else if (Notification.permission === 'granted') {
                            alert('Lembrete já está ativado para este evento!');
                          } else {
                            alert('Você bloqueou as notificações.');
                          }
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
    </>
  );
}
