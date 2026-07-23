'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/lib/lang-context';
import Countdown from './Countdown';
import styles from '@/app/(public)/leiloes/leiloes.module.css';

export interface AuctionEvent {
  id: string;
  title: string;
  date: string;
  status: 'live' | 'scheduled' | 'closed' | string;
  youtube: string | null;
  cover: string | null;
  catalog: string | null;
}

export default function AuctionsBrowser({ events }: { events: AuctionEvent[] }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for inputs to allow typing before submitting
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [monthFilter, setMonthFilter] = useState(searchParams.get('month') || '');

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/leiloes?${params.toString()}`, { scroll: false });
  };

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

  return (
    <>
      {heroEvent && (
        <section className={styles.heroSection} style={{ backgroundImage: `url(${heroEvent.cover}), linear-gradient(135deg, #111827, #1f2937)` }}>
          <div className={styles.heroOverlay}></div>
          
          <div className={styles.heroContent}>
            {heroEvents.length > 1 && (
              <>
                <button onClick={prevHero} className={`${styles.navButton} ${styles.navPrev}`} aria-label="Anterior">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button onClick={nextHero} className={`${styles.navButton} ${styles.navNext}`} aria-label="Próximo">
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </>
            )}

            <div className={styles.heroGrid}>
              <div className={styles.heroInfo}>
                <div>
                  <div className={`${styles.statusBadge} ${getEventState(heroEvent).isLive ? styles.statusLive : styles.statusScheduled}`}>
                    {getEventState(heroEvent).isLive ? <><span className="live-indicator"></span> Transmissão Ao Vivo</> : 'Evento Agendado'}
                  </div>
                </div>
                <h1 className={styles.heroTitle}>{heroEvent.title}</h1>
                <p className={styles.heroDesc}>Acompanhe os melhores lotes e dê seu lance em tempo real.</p>
                <div className={styles.heroActions}>
                  <Link href={`/leiloes/${heroEvent.id}`} className="btn btn--outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>Acessar Leilão Completo</Link>
                  {heroEvent.catalog && (
                    <a href={heroEvent.catalog} target="_blank" rel="noopener noreferrer" className="btn btn--accent" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Baixar Catálogo
                    </a>
                  )}
                </div>
              </div>
            
              <div className={styles.countdownWrapper}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <h3 className={styles.countdownTitle}>{getEventState(heroEvent).isLive ? 'O leilão está acontecendo agora!' : 'Tempo restante:'}</h3>
                  {getEventState(heroEvent).isScheduled && <Countdown targetDateStr={heroEvent.date} />}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

    <main className="container" style={{ paddingTop: heroEvent ? '3rem' : 'calc(var(--header-h) + 3rem)', paddingBottom: '3rem' }}>
      <div className={styles.filtersRow}>
        <div>
          <h1 className="section-title">Próximos Leilões</h1>
          <p style={{ color: 'var(--clr-text-light)' }}>Confira o calendário completo de eventos e remates.</p>
        </div>
        <div className={styles.filtersGroup}>
          
          <div className={styles.searchInputWrapper}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input 
              type="text" 
              placeholder="Buscar por raça, fazenda, nome..." 
              className="form-input premium-filter" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => handleFilterChange('q', searchQuery)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilterChange('q', searchQuery)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
            
          <div className={styles.filterSelectWrapper}>
            <input 
              type="month" 
              className="form-input premium-filter" 
              style={{ paddingRight: '1.2rem', cursor: 'text' }}
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                handleFilterChange('month', e.target.value);
              }}
            />
          </div>
  
          <div className={styles.filterSelectWrapper}>
            <select 
              className="form-input premium-filter" 
              value={searchParams.get('status') || 'todos'}
              onChange={(e) => handleFilterChange('status', e.target.value === 'todos' ? '' : e.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="closed">Encerrados</option>
            </select>
            <svg className={styles.selectIcon} viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>

        </div>
      </div>

      <div className="ads-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {events.length === 0 ? (
          <p className={styles.emptyState}>
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
              <Link href={`/leiloes/${ev.id}`} key={ev.id} className="ad-card" style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: stripeColor, height: '4px', width: '100%' }}></div>
                <div className={styles.adCardImgWrapper}>
                  <div className={styles.adCardBadge} style={{ background: statusBg }}>
                    {statusText}
                    {isLive && <span className={styles.pulseDot}></span>}
                  </div>
                  <Image 
                    src={ev.cover || 'https://via.placeholder.com/600x400'} 
                    alt={ev.title} 
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className={styles.adCardImg}
                    style={{ filter: imgFilter }}
                  />
                </div>
                
                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    <span>Data: {formattedDate}</span>
                    <span>Hora: {formattedTime}</span>
                  </div>
                  <h3 className={styles.cardTitle}>
                    {ev.title}
                  </h3>
                  
                  <div className={styles.cardActions}>
                    <span className="btn btn--accent" style={{ flex: 1, justifyContent: 'center', pointerEvents: 'none' }}>
                      {isClosed ? 'Ver Resultados' : isLive ? 'Participar' : 'Ver Lotes'}
                    </span>
                    {!isClosed && (
                      <button 
                        className="btn btn--outline" 
                        aria-label="Lembrar-me" 
                        style={{ padding: '0 1rem' }}
                        onClick={(e) => {
                          e.preventDefault();
                          if (typeof Notification !== 'undefined') {
                            if (Notification.permission === 'default') {
                              Notification.requestPermission().then(p => {
                                if (p === 'granted') alert('Lembrete ativado!');
                              });
                            } else if (Notification.permission === 'granted') {
                              alert('Lembrete já está ativado para este evento!');
                            } else {
                              alert('Você bloqueou as notificações.');
                            }
                          }
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </main>
    </>
  );
}
