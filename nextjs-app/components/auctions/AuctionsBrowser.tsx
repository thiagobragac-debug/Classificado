'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { useLang } from '@/lib/lang-context';
import { showToast } from '@/lib/toast';
import { imageUrl } from '@/lib/storage';
import Countdown from './Countdown';
import styles from '@/app/(public)/leiloes/leiloes.module.css';

export interface AuctionEvent {
  id: string;
  title: string;
  // Coluna nova (auditoria de i18n, 2026-08-26/27) — fallback pra title
  // quando vazia/nula, igual ao padrão já usado em ads.title_es.
  title_es?: string | null;
  date: string;
  status: 'live' | 'scheduled' | 'closed' | 'cancelled' | 'active' | 'draft';
  youtube: string | null;
  cover: string | null;
  catalog: string | null;
}

// BUG CORRIGIDO (auditoria de i18n, 2026-08-26/27): useLang() já estava
// importado mas nunca era usado de verdade — toda a UI deste componente
// (hero, filtros, badges de status, cards, toasts) ficava fixa em
// português mesmo com ES selecionado no seletor do Header. Strings novas
// que não existem no dicionário global (lib/constants.ts) seguem o
// mesmo padrão local já usado em components/ads/AdsSidebar.tsx.
const TRANSLATIONS = {
  pt: {
    liveNow: 'Transmissão Ao Vivo',
    scheduledEvent: 'Evento Agendado',
    heroDesc: 'Acompanhe os melhores lotes e dê seu lance em tempo real.',
    accessAuction: 'Acessar Leilão Completo',
    downloadCatalog: 'Baixar Catálogo',
    happeningNow: 'O leilão está acontecendo agora!',
    timeLeft: 'Tempo restante:',
    upcomingAuctions: 'Próximos Leilões',
    subtitle: 'Confira o calendário completo de eventos e remates.',
    searchAuctions: 'Buscar leilões',
    searchPlaceholder: 'Buscar por raça, fazenda, nome...',
    filterDate: 'Filtrar por data',
    filterStatus: 'Filtrar por status',
    statusActive: 'Ativos',
    statusAll: 'Todos os status',
    statusClosed: 'Encerrados',
    statusCancelled: 'Cancelados',
    empty: 'Nenhum leilão encontrado para os filtros selecionados.',
    loadError: 'Erro ao carregar leilões. Tente novamente em instantes.',
    badgeScheduled: 'AGENDADO',
    badgeLive: 'AO VIVO',
    badgeClosed: 'ENCERRADO',
    badgeCancelled: 'CANCELADO',
    actionCancelled: 'Cancelado',
    actionResults: 'Ver Resultados',
    actionJoin: 'Participar',
    actionViewLots: 'Ver Lotes',
    remindMe: 'Lembrar-me',
    reminderOn: 'Lembrete ativado!',
    reminderDenied: 'Permissão de notificação negada.',
    reminderAlreadyOn: 'Lembrete já está ativado para este evento!',
    reminderBlocked: 'Você bloqueou as notificações. Habilite nas configurações do navegador.',
  },
  es: {
    liveNow: 'Transmisión En Vivo',
    scheduledEvent: 'Evento Programado',
    heroDesc: 'Seguí los mejores lotes y ofertá en tiempo real.',
    accessAuction: 'Acceder al Remate Completo',
    downloadCatalog: 'Descargar Catálogo',
    happeningNow: '¡El remate está sucediendo ahora!',
    timeLeft: 'Tiempo restante:',
    upcomingAuctions: 'Próximos Remates',
    subtitle: 'Descubrí el calendario completo de eventos y remates.',
    searchAuctions: 'Buscar remates',
    searchPlaceholder: 'Buscar por raza, establecimiento, nombre...',
    filterDate: 'Filtrar por fecha',
    filterStatus: 'Filtrar por estado',
    statusActive: 'Activos',
    statusAll: 'Todos los estados',
    statusClosed: 'Finalizados',
    statusCancelled: 'Cancelados',
    empty: 'No se encontraron remates para los filtros seleccionados.',
    loadError: 'Error al cargar los remates. Intenta nuevamente en unos instantes.',
    badgeScheduled: 'PROGRAMADO',
    badgeLive: 'EN VIVO',
    badgeClosed: 'FINALIZADO',
    badgeCancelled: 'CANCELADO',
    actionCancelled: 'Cancelado',
    actionResults: 'Ver Resultados',
    actionJoin: 'Participar',
    actionViewLots: 'Ver Lotes',
    remindMe: 'Recordarme',
    reminderOn: '¡Recordatorio activado!',
    reminderDenied: 'Permiso de notificación denegado.',
    reminderAlreadyOn: '¡El recordatorio ya está activado para este evento!',
    reminderBlocked: 'Bloqueaste las notificaciones. Habilitalas en la configuración del navegador.',
  },
} as const;

export default function AuctionsBrowser({ events, loadError }: { events: AuctionEvent[]; loadError?: boolean }) {
  const { lang, t } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const dateLocale = lang === 'es' ? 'es-AR' : 'pt-BR';
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for inputs to allow typing before submitting
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [monthFilter, setMonthFilter] = useState(searchParams.get('month') || '');

  // Debounced search — fires 400ms after last keystroke
  const debouncedSearch = useDebouncedCallback((value: string) => {
    handleFilterChange('q', value);
  }, 400);

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
    if (ev.status === 'cancelled') return { isClosed: false, isLive: false, isScheduled: false, isCancelled: true };
    if (ev.status === 'closed') return { isClosed: true, isLive: false, isScheduled: false, isCancelled: false };
    if (ev.status === 'live') return { isClosed: false, isLive: true, isScheduled: false, isCancelled: false };
    if (ev.status === 'scheduled') return { isClosed: false, isLive: false, isScheduled: true, isCancelled: false };

    const evDate = new Date(ev.date).getTime();
    const now = new Date().getTime();
    if (evDate > now) {
      return { isClosed: false, isLive: false, isScheduled: true, isCancelled: false };
    } else {
      return { isClosed: false, isLive: true, isScheduled: false, isCancelled: false };
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
                <button onClick={prevHero} className={`${styles.navButton} ${styles.navPrev}`} aria-label={t('pagination_prev')}>
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button onClick={nextHero} className={`${styles.navButton} ${styles.navNext}`} aria-label={t('pagination_next')}>
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </>
            )}

            <div className={styles.heroGrid}>
              <div className={styles.heroInfo}>
                <div>
                  <div className={`${styles.statusBadge} ${getEventState(heroEvent).isLive ? styles.statusLive : styles.statusScheduled}`}>
                    {getEventState(heroEvent).isLive ? <><span className="live-indicator"></span> {T.liveNow}</> : T.scheduledEvent}
                  </div>
                </div>
                <h2 className={styles.heroTitle}>{lang === 'es' && heroEvent.title_es ? heroEvent.title_es : heroEvent.title}</h2>
                <p className={styles.heroDesc}>{T.heroDesc}</p>
                <div className={styles.heroActions}>
                  <Link href={`/leiloes/${heroEvent.id}`} className="btn btn--outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>{T.accessAuction}</Link>
                  {heroEvent.catalog && (
                    <a href={heroEvent.catalog} target="_blank" rel="noopener noreferrer" className="btn btn--accent" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {T.downloadCatalog}
                    </a>
                  )}
                </div>
              </div>

              <div className={styles.countdownWrapper}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <h3 className={styles.countdownTitle}>{getEventState(heroEvent).isLive ? T.happeningNow : T.timeLeft}</h3>
                  {getEventState(heroEvent).isScheduled && <Countdown targetDateStr={heroEvent.date} />}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

    <main className="container" style={{ paddingTop: heroEvent ? '1.5rem' : 'calc(var(--header-h) + 2rem)', paddingBottom: '3rem' }}>
      <div className={styles.filtersRow}>
        <div>
          <h1 className="section-title">{T.upcomingAuctions}</h1>
          <p style={{ color: 'var(--clr-text-light)' }}>{T.subtitle}</p>
        </div>
        <div className={styles.filtersGroup}>
          
          <div className={styles.searchInputWrapper}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <label htmlFor="search-auctions" className="sr-only">{T.searchAuctions}</label>
            <input
              id="search-auctions"
              type="text"
              placeholder={T.searchPlaceholder}
              className="form-input premium-filter"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                debouncedSearch(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleFilterChange('q', searchQuery)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
            
          <div className={styles.filterSelectWrapper} style={{ minWidth: '155px', width: '155px', flex: '0 0 155px' }}>
            <label htmlFor="filter-date" className="sr-only">{T.filterDate}</label>
            <input
              id="filter-date"
              type="date"
              className="form-input premium-filter"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                handleFilterChange('month', e.target.value);
              }}
              style={{ paddingLeft: '1.2rem', paddingRight: '1.2rem', cursor: 'pointer' }}
            />
          </div>
  
          <div className={styles.filterSelectWrapper} style={{ minWidth: '150px', width: '150px', flex: '0 0 150px' }}>
            <label htmlFor="filter-status" className="sr-only">{T.filterStatus}</label>
            <select
              id="filter-status"
              className="form-input premium-filter"
              value={searchParams.get('status') || 'active'}
              onChange={(e) => handleFilterChange('status', e.target.value === 'active' ? '' : e.target.value)}
              style={{ paddingLeft: '1.2rem', paddingRight: '2.5rem', appearance: 'none' }}
            >
              <option value="active">{T.statusActive}</option>
              <option value="todos">{T.statusAll}</option>
              <option value="closed">{T.statusClosed}</option>
              <option value="cancelled">{T.statusCancelled}</option>
            </select>
            <svg className={styles.selectIcon} viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>

        </div>
      </div>

      <div className="ads-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {events.length === 0 ? (
          <p className={styles.emptyState}>
            {loadError ? T.loadError : T.empty}
          </p>
        ) : (
          events.map(ev => {
            const { isLive, isClosed, isScheduled, isCancelled } = getEventState(ev);

            let statusText: string = T.badgeScheduled;
            let statusBg = '#3b82f6';
            let stripeColor = '#3b82f6';

            if (isLive) {
              statusText = T.badgeLive;
              statusBg = '#ef4444';
              stripeColor = '#ef4444';
            } else if (isClosed) {
              statusText = T.badgeClosed;
              statusBg = '#6b7280';
              stripeColor = '#6b7280';
            } else if (isCancelled) {
              statusText = T.badgeCancelled;
              statusBg = '#991b1b';
              stripeColor = '#991b1b';
            }

            const imgFilter = !isLive ? 'grayscale(80%) opacity(0.85)' : 'none';
            const evTitle = lang === 'es' && ev.title_es ? ev.title_es : ev.title;
            const dateObj = new Date(ev.date);
            const formattedDate = dateObj.toLocaleDateString(dateLocale);
            const formattedTime = dateObj.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });

            return (
              <Link href={`/leiloes/${ev.id}`} key={ev.id} className="ad-card" style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: stripeColor, height: '4px', width: '100%' }}></div>
                <div className={styles.adCardImgWrapper}>
                  <div className={styles.adCardBadge} style={{ background: statusBg }}>
                    {isLive && <span className={styles.pulseDot} style={{ background: '#fff' }}></span>}
                    {isScheduled && <span className={styles.pulseDot} style={{ background: '#4ade80' }}></span>}
                    {statusText}
                  </div>
                  <Image
                    src={imageUrl(ev.cover)}
                    alt={evTitle}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className={styles.adCardImg}
                    style={{ filter: imgFilter }}
                  />
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardMeta} style={{ fontSize: '0.85rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> {formattedDate}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--clr-text)', fontWeight: 800 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> {formattedTime}</span>
                  </div>
                  <h3 className={styles.cardTitle}>
                    {evTitle}
                  </h3>

                  <div className={styles.cardActions}>
                    <span className="btn btn--accent" style={{ flex: 1, justifyContent: 'center', pointerEvents: 'none' }}>
                      {isCancelled ? T.actionCancelled : isClosed ? T.actionResults : isLive ? T.actionJoin : T.actionViewLots}
                    </span>
                    {!isClosed && !isCancelled && (
                      <button
                        className="btn btn--outline"
                        aria-label={T.remindMe}
                        style={{ padding: '0 1rem' }}
                        onClick={(e) => {
                          e.preventDefault();
                          if (typeof Notification !== 'undefined') {
                            if (Notification.permission === 'default') {
                              Notification.requestPermission().then(p => {
                                if (p === 'granted') showToast(T.reminderOn, 'success');
                                else showToast(T.reminderDenied, 'warning');
                              });
                            } else if (Notification.permission === 'granted') {
                              showToast(T.reminderAlreadyOn, 'info');
                            } else {
                              showToast(T.reminderBlocked, 'warning');
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
