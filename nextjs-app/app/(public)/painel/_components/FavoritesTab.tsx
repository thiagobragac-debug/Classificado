'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getMyFavorites, rpcToggleFav } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { useLang } from '@/lib/lang-context';
import { formatPrice } from '@/lib/currency';
import styles from '../painel.module.css';

const TRANSLATIONS = {
  pt: {
    title: 'Favoritos', subtitle: 'Anúncios que você salvou',
    search: 'Buscar favoritos...',
    emptyTitle: 'Nenhum favorito salvo',
    emptyDesc: 'Navegue pelos anúncios e clique no ícone de coração para salvar os que mais te interessarem.',
    explore: 'Explorar Anúncios',
    removeFav: 'Remover dos favoritos',
    seeAd: 'Ver anúncio →',
    removeError: 'Ocorreu um erro ao remover o favorito.',
    loadError: 'Erro ao carregar seus favoritos.',
  },
  es: {
    title: 'Favoritos', subtitle: 'Anuncios que guardaste',
    search: 'Buscar favoritos...',
    emptyTitle: 'Ningún favorito guardado',
    emptyDesc: 'Navega por los anuncios y haz clic en el ícono de corazón para guardar los que más te interesen.',
    explore: 'Explorar Anuncios',
    removeFav: 'Quitar de favoritos',
    seeAd: 'Ver anuncio →',
    removeError: 'Ocurrió un error al quitar el favorito.',
    loadError: 'Error al cargar tus favoritos.',
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

export function FavoritesTab({ userId }: { userId: string }) {
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [search, setSearch] = useState('');

  // BUG CORRIGIDO (varredura cruzada de cenários): `error` do useSWR não
  // era lido — uma falha real de fetch (rede, RLS) renderizava a MESMA UI
  // de "nenhum favorito salvo", indistinguível de um usuário que realmente
  // não tem favoritos. MyAdsTab.tsx já tinha esse tratamento correto.
  const { data: favs = [], error, isLoading, mutate } = useSWR(
    'myFavorites',
    getMyFavorites
  );

  // BUG CORRIGIDO (validação adversarial final): rpcToggleFav é um TOGGLE,
  // não um "remover" idempotente — um segundo clique disparado antes do
  // primeiro `await` resolver (duplo-clique, rede lenta) chamava a RPC de
  // novo e RE-ADICIONAVA o favorito que o primeiro clique tinha acabado de
  // remover, enquanto a UI otimista continuava mostrando removido. Guarda
  // por id em andamento ignora o clique duplicado.
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const handleRemove = async (adId: string) => {
    if (removingIds.has(adId)) return;
    setRemovingIds(prev => new Set(prev).add(adId));
    const previousFavs = favs;
    try {
      // Optimistic update
      mutate(favs.filter((a: any) => a.id !== adId), false);
      await rpcToggleFav(adId);
      mutate();

      // Sincroniza com o localStorage global (usado pelos cards na Home)
      try {
        const stored = localStorage.getItem('tc_favorites');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            localStorage.setItem('tc_favorites', JSON.stringify(parsed.filter(id => id !== adId)));
          }
        }
      } catch (e) {}
    } catch {
      // BUG CORRIGIDO (validação adversarial final): `mutate()` sem
      // argumento REVALIDA (busca de novo no servidor) — não "reverte" pro
      // estado anterior como o comentário antigo dizia. Numa falha de rede
      // de verdade, essa revalidação falha também, e o item ficava preso
      // como "removido" na UI pra sempre, sem nunca ter sido removido de
      // fato no servidor. Reverte pro snapshot local anterior, que não
      // depende de rede nenhuma.
      mutate(previousFavs, false);
      showToast(t.removeError, 'error');
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev);
        next.delete(adId);
        return next;
      });
    }
  };

  // BUG CORRIGIDO (auditoria i18n, 2026-08-27): mesmo bug de ordem PT/ES
  // dos itens de MyAdsTab/MessagesTab — checa lang primeiro, com fallback
  // pra title_pt (mesmo padrão de AdCard.tsx).
  const adTitle = (ad: any) => (lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt) || '';
  const filtered = favs.filter((ad: any) => !search || adTitle(ad).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={styles.fadeIn}>
      <div className={styles.flexBetween}>
        <div>
          <h1 className={styles.headerTitle}>{t.title}</h1>
          <p className={styles.headerSubtitle}>{t.subtitle}</p>
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-light)" strokeWidth="2.5" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.search}
            className={styles.formInput}
            style={{ paddingLeft: '2.8rem', borderRadius: '2rem' }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className={styles.spinner} />
      ) : error ? (
        <div className={styles.emptyState}>{t.loadError}</div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: '4rem 2rem', border: '1px dashed var(--clr-border)', borderRadius: '1rem', background: 'white' }}>
          <div className={styles.emptyStateIcon} style={{ width: '80px', height: '80px', background: 'var(--clr-bg-alt)', color: 'var(--clr-text-light)', border: 'none' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <h3 className={styles.emptyStateTitle} style={{ fontSize: '1.5rem', marginTop: '1.5rem', fontWeight: 800 }}>{t.emptyTitle}</h3>
          <p className={styles.emptyStateDesc} style={{ fontSize: '1rem', maxWidth: '420px', lineHeight: 1.6, color: 'var(--clr-text-muted)' }}>
            {t.emptyDesc}
          </p>
          <Link href="/listagem" className={styles.primaryButton} style={{ marginTop: '1.5rem', padding: '0.85rem 2.5rem', fontSize: '1.1rem', borderRadius: '2rem' }}>{t.explore}</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {filtered.filter(Boolean).map((ad: any) => {
            const img = ad.images?.[0];
            return (
              <div key={ad.id} className={styles.card} style={{ overflow: 'hidden' }}>
                <div style={{ height: 140, background: 'var(--clr-surface-alt)', overflow: 'hidden', position: 'relative' }}>
                  {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <button
                    onClick={() => handleRemove(ad.id)}
                    disabled={removingIds.has(ad.id)}
                    aria-label={t.removeFav}
                    style={{ position: 'absolute', top: '.5rem', right: '.5rem', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.9)', border: 'none', cursor: removingIds.has(ad.id) ? 'not-allowed' : 'pointer', opacity: removingIds.has(ad.id) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-error)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--clr-text)', marginBottom: '.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adTitle(ad)}</div>
                  <div style={{ fontWeight: 700, color: 'var(--clr-primary-mid)', fontSize: '.95rem', marginBottom: '.5rem' }}>{fMoney(ad.price, ad.currency, lang)}</div>
                  <Link href={`/anuncio/${ad.id}`} style={{ display: 'block', textAlign: 'center', padding: '.5rem', borderRadius: '.5rem', background: 'var(--clr-primary-pale)', color: 'var(--clr-primary-mid)', fontWeight: 700, fontSize: '.8rem', textDecoration: 'none' }}>
                    {t.seeAd}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
