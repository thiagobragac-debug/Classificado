'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR, { mutate as mutateGlobal } from 'swr';
import { getMyAds, toggleAdStatus } from '@/lib/supabase';
import { deleteAd } from '@/lib/supabase-panel';
import { showToast } from '@/lib/toast';
import { usePushNotifications } from './usePush';
import { AdQuotaGraceBanner } from './AdQuotaGraceBanner';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { imageUrl } from '@/lib/storage';
import { useLang } from '@/lib/lang-context';
import { formatPrice } from '@/lib/currency';
import styles from '../painel.module.css';

const TRANSLATIONS = {
  pt: {
    title: 'Meus Anúncios', notify: '🔔 Ativar Notificações', activating: 'Ativando...',
    loading: 'Carregando...', noAds: 'Nenhum anúncio encontrado',
    ad: 'anúncio', ads: 'anúncios',
    allStatus: 'Todos os Status', active: 'Ativos', pending: 'Pendentes', paused: 'Pausados', expired: 'Expirados',
    loadError: 'Erro ao carregar anúncios.',
    emptyTitle: 'Crie seu primeiro anúncio',
    emptyDesc: 'Alcance milhares de compradores em todo o Mercosul. Venda bovinos, máquinas e propriedades rurais com a melhor vitrine do agronegócio.',
    publishNow: 'Publicar Anúncio Agora',
    featured: '⭐ Destaque',
    waitingSlot: 'Aguardando vaga — você atingiu o limite de anúncios ativos do seu plano',
    views: 'visualizações',
    edit: 'Editar', reactivate: 'Reativar', pause: 'Pausar', delete: 'Excluir',
    confirmDelete: 'Tem certeza que deseja excluir este anúncio?',
    confirmTitle: 'Confirmação',
    deleteError: 'Erro ao excluir.',
    toggleError: 'Erro ao alterar status.',
    quotaError: 'Você atingiu o limite de anúncios ativos do seu plano. Pause outro anúncio ou faça upgrade.',
    prev: '← Anterior', next: 'Próxima →',
    statusActive: 'Ativo', statusPending: 'Pendente', statusPaused: 'Pausado', statusExpired: 'Expirado',
    noAdsStatus: 'Nenhum anúncio {status} no momento',
  },
  es: {
    title: 'Mis Anuncios', notify: '🔔 Activar Notificaciones', activating: 'Activando...',
    loading: 'Cargando...', noAds: 'Ningún anuncio encontrado',
    ad: 'anuncio', ads: 'anuncios',
    allStatus: 'Todos los Estados', active: 'Activos', pending: 'Pendientes', paused: 'Pausados', expired: 'Expirados',
    loadError: 'Error al cargar los anuncios.',
    emptyTitle: 'Crea tu primer anuncio',
    emptyDesc: 'Llega a miles de compradores en todo el Mercosur. Vende bovinos, máquinas y propiedades rurales con la mejor vitrina del agronegocio.',
    publishNow: 'Publicar Anuncio Ahora',
    featured: '⭐ Destacado',
    waitingSlot: 'Esperando lugar — alcanzaste el límite de anuncios activos de tu plan',
    views: 'visualizaciones',
    edit: 'Editar', reactivate: 'Reactivar', pause: 'Pausar', delete: 'Eliminar',
    confirmDelete: '¿Estás seguro de que deseas eliminar este anuncio?',
    confirmTitle: 'Confirmación',
    deleteError: 'Error al eliminar.',
    toggleError: 'Error al cambiar el estado.',
    quotaError: 'Alcanzaste el límite de anuncios activos de tu plan. Pausa otro anuncio o mejora tu plan.',
    prev: '← Anterior', next: 'Siguiente →',
    statusActive: 'Activo', statusPending: 'Pendiente', statusPaused: 'Pausado', statusExpired: 'Expirado',
    noAdsStatus: 'Ningún anuncio {status} en este momento',
  },
};

// BUG CORRIGIDO (aplicação de todos os achados de baixa prioridade
// pendentes): este componente mantinha seu próprio mapa de símbolos de
// moeda, duplicado do canônico em lib/currency.ts — sem bug ativo hoje
// (os valores coincidiam), mas qualquer mudança futura no mapa canônico
// não chegaria até aqui. Agora delega pra formatPrice/getCurrencySymbol.
function fMoney(price: number | null | undefined, currency = 'BRL', lang: 'pt' | 'es' = 'pt') {
  if (price == null) return '—';
  return formatPrice(price, currency, lang);
}

function fDate(iso: string, lang = 'pt') {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return lang === 'es' ? 'ahora' : 'agora';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd';
  return d.toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR', { day: '2-digit', month: 'short' });
}

export function MyAdsTab({ userId, adStats, planMeta }: { userId: string, adStats?: { active: number }, planMeta?: { ads: number, unlimited: boolean } }) {
  const { confirm } = useConfirm();
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    active:  { label: t.statusActive,  className: styles.statusActive },
    pending: { label: t.statusPending, className: styles.statusPending },
    paused:  { label: t.statusPaused,  className: styles.statusPaused },
    expired: { label: t.statusExpired, className: styles.statusExpired },
  };
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const { subscribe, loading: pushLoading } = usePushNotifications();

  // SWR for data fetching
  const { data, error, isLoading, mutate } = useSWR(
    ['myAds', statusFilter, page],
    () => getMyAds({ status: statusFilter, page, limit: 12 }),
    { keepPreviousData: true }
  );

  const ads = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 12);

  // GAP CORRIGIDO (teste do plano Grátis, 2026-08-25): um anúncio pendente
  // que não pode ser aprovado por causa da cota do plano (trigger
  // enforce_ad_quota) era visualmente idêntico a um pendente comum
  // aguardando moderação — nada na UI explicava o motivo real.
  const atQuota = !!planMeta && !planMeta.unlimited && !!adStats && adStats.active >= planMeta.ads;

  const handleDelete = async (id: string) => {
    // BUG CORRIGIDO (achado i18n): ConfirmProvider não é lang-aware, título default fixo em PT
    if (!(await confirm(t.confirmDelete, t.confirmTitle))) return;
    try {
      await deleteAd(id);
      mutate(); // Refetch
      // BUG CORRIGIDO (achado de usabilidade): a cota da sidebar
      // (PainelClient) usa uma chave SWR própria ('adStats', userId) —
      // sem invalidar essa chave aqui, excluir um anúncio ativo não
      // atualizava o contador de cota até um F5.
      mutateGlobal(['adStats', userId]);
    } catch {
      showToast(t.deleteError, 'error');
    }
  };

  const handleToggle = async (id: string, status: string) => {
    try {
      await toggleAdStatus(id, status);
      mutate(); // Refetch
      mutateGlobal(['adStats', userId]); // Mantém a cota da sidebar em sincronia (ver handleDelete)
    } catch (err: any) {
      // BUG CORRIGIDO (teste do plano Grátis, 2026-08-25): o catch descartava
      // err.message e sempre mostrava um erro genérico — quando a reativação
      // esbarra na cota de anúncios do plano (trigger enforce_ad_quota,
      // P0001), esse é o ÚNICO caminho self-service que alcança esse erro, e
      // o usuário nunca via a mensagem real explicando o motivo.
      // BUG CORRIGIDO (achado i18n): erro cru do trigger Postgres (enforce_ad_quota) vinha sempre em PT
      const isQuotaError = err?.message?.includes('Limite de') && err?.message?.includes('anuncios ativos');
      showToast(isQuotaError ? t.quotaError : (err?.message || t.toggleError), 'error');
    }
  };

  return (
    <div className={styles.fadeIn}>
      <AdQuotaGraceBanner userId={userId} />
      <div className={styles.flexBetween}>
        <div>
          <h1 className={styles.headerTitle}>{t.title}</h1>
          <button
            onClick={subscribe}
            disabled={pushLoading}
            className={styles.secondaryButton}
            style={{ marginTop: '0.5rem' }}
          >
            {pushLoading ? t.activating : t.notify}
          </button>
          <p className={styles.headerSubtitle}>
            {isLoading ? t.loading : total === 0 ? t.noAds : `${total} ${total > 1 ? t.ads : t.ad}`}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className={styles.inputSelect}
        >
          <option value="all">{t.allStatus}</option>
          <option value="active">{t.active}</option>
          <option value="pending">{t.pending}</option>
          <option value="paused">{t.paused}</option>
          <option value="expired">{t.expired}</option>
        </select>
      </div>

      {isLoading && ads.length === 0 ? (
        <div className={styles.spinner} />
      ) : error ? (
        <div className={styles.emptyState}>{t.loadError}</div>
      ) : ads.length === 0 ? (
        // BUG CORRIGIDO (achado de usabilidade): um filtro de status
        // específico (ex. "Pausados") sem resultados reaproveitava o mesmo
        // onboarding de "crie seu primeiro anúncio" — enganoso pra quem já
        // tem anúncios (só não tem nenhum NESSE status). O onboarding
        // completo fica reservado pra quando não há filtro nenhum.
        statusFilter !== 'all' ? (
          <div className={styles.emptyState} style={{ padding: '3rem 2rem', border: '1px dashed var(--clr-border)', borderRadius: '1rem', background: 'white' }}>
            <p className={styles.emptyStateDesc} style={{ fontSize: '1rem', color: 'var(--clr-text-muted)' }}>
              {t.noAdsStatus.replace('{status}', (STATUS_LABELS[statusFilter]?.label || statusFilter).toLowerCase())}
            </p>
            <button
              onClick={() => { setStatusFilter('all'); setPage(1); }}
              className={styles.secondaryButton}
              style={{ marginTop: '1rem' }}
            >
              {t.allStatus}
            </button>
          </div>
        ) : (
          <div className={styles.emptyState} style={{ padding: '4rem 2rem', border: '1px dashed var(--clr-border)', borderRadius: '1rem', background: 'white' }}>
            <div className={styles.emptyStateIcon} style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, var(--clr-primary), #0ea5e9)', color: 'white', border: 'none', boxShadow: '0 10px 25px rgba(22,163,74,0.2)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8"/><path d="M8 12h8"/>
              </svg>
            </div>
            <h3 className={styles.emptyStateTitle} style={{ fontSize: '1.5rem', marginTop: '1.5rem', fontWeight: 800 }}>{t.emptyTitle}</h3>
            <p className={styles.emptyStateDesc} style={{ fontSize: '1rem', maxWidth: '420px', lineHeight: 1.6, color: 'var(--clr-text-muted)' }}>
              {t.emptyDesc}
            </p>
            <Link href="/anunciar" className={styles.primaryButton} style={{ marginTop: '1.5rem', padding: '0.85rem 2.5rem', fontSize: '1.1rem', borderRadius: '2rem' }}>
              {t.publishNow}
            </Link>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ads.map((ad: any) => {
            const img = ad.images?.[0] ? imageUrl(ad.images[0], '') : '';
            const status = STATUS_LABELS[ad.status] || STATUS_LABELS.pending;
            
            return (
              <div key={ad.id} className={`${styles.card} ${styles.adCard}`}>
                {/* Imagem */}
                <div className={styles.adCardImage}>
                  {img ? (
                    <Image src={img} alt="" fill style={{ objectFit: 'cover' }} sizes="120px" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" color="var(--clr-text-light)">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                  )}
                </div>
                
                {/* Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem', flexWrap: 'wrap' }}>
                    <span className={`${styles.statusBadge} ${status.className}`}>{status.label}</span>
                    {ad.featured && <span className={`${styles.statusBadge} ${styles.statusFeatured}`}>{t.featured}</span>}
                    {ad.status === 'pending' && atQuota && (
                      <span style={{ fontSize: '.75rem', color: 'var(--clr-text-muted)' }}>
                        {t.waitingSlot}
                      </span>
                    )}
                  </div>
                  <div className={styles.adCardTitle}>
                    {lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt}
                  </div>
                  <div className={styles.adCardMeta}>
                    <span className={styles.adCardPrice}>{fMoney(ad.price, ad.currency, lang)}</span>
                    {ad.city && <span>{ad.city}{ad.state ? `, ${ad.state}` : ''}</span>}
                    <span>👁 {ad.views_count || 0} {t.views}</span>
                    <span>{fDate(ad.created_at, lang)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className={styles.adCardActions}>
                  <Link href={`/anunciar?id=${ad.id}`} title={t.edit} className={styles.actionBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Link>
                  <button
                    title={ad.status === 'paused' ? t.reactivate : t.pause}
                    onClick={() => handleToggle(ad.id, ad.status)}
                    className={styles.actionBtn}
                  >
                    {ad.status === 'paused'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    }
                  </button>
                  <button title={t.delete} onClick={() => handleDelete(ad.id)} className={`${styles.actionBtn} ${styles.actionBtnDanger}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={styles.secondaryButton}>
            {t.prev}
          </button>
          <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={styles.secondaryButton}>
            {t.next}
          </button>
        </div>
      )}
    </div>
  );
}
