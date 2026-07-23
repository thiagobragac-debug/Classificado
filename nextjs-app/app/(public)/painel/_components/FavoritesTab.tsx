'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getMyFavorites, rpcToggleFav } from '@/lib/supabase';
import styles from '../painel.module.css';

function fMoney(price: number | null | undefined, currency = 'BRL') {
  if (price == null) return '—';
  const sym: Record<string, string> = { BRL: 'R$', USD: 'US$', ARS: 'AR$', PYG: '₲', UYU: '$U' };
  const s = sym[currency] || currency;
  return `${s} ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export function FavoritesTab({ userId }: { userId: string }) {
  const [search, setSearch] = useState('');

  const { data: favs = [], isLoading, mutate } = useSWR(
    'myFavorites',
    getMyFavorites
  );

  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleRemove = async (adId: string) => {
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
      mutate(); // Revert optimistic update
      showToast('Ocorreu um erro ao remover o favorito.');
    }
  };

  const filtered = favs.filter((ad: any) => !search || (ad.title_pt || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={styles.fadeIn}>
      <div className={styles.flexBetween}>
        <div>
          <h1 className={styles.headerTitle}>Favoritos</h1>
          <p className={styles.headerSubtitle}>Anúncios que você salvou</p>
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-light)" strokeWidth="2.5" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Buscar favoritos..."
            className={styles.formInput}
            style={{ paddingLeft: '2.8rem', borderRadius: '2rem' }}
          />
        </div>
      </div>
      
      {isLoading ? (
        <div className={styles.spinner} />
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: '4rem 2rem', border: '1px dashed var(--clr-border)', borderRadius: '1rem', background: 'white' }}>
          <div className={styles.emptyStateIcon} style={{ width: '80px', height: '80px', background: 'var(--clr-bg-alt)', color: 'var(--clr-text-light)', border: 'none' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <h3 className={styles.emptyStateTitle} style={{ fontSize: '1.5rem', marginTop: '1.5rem', fontWeight: 800 }}>Nenhum favorito salvo</h3>
          <p className={styles.emptyStateDesc} style={{ fontSize: '1rem', maxWidth: '420px', lineHeight: 1.6, color: 'var(--clr-text-muted)' }}>
            Navegue pelos anúncios e clique no ícone de coração para salvar os que mais te interessarem.
          </p>
          <Link href="/listagem" className={styles.primaryButton} style={{ marginTop: '1.5rem', padding: '0.85rem 2.5rem', fontSize: '1.1rem', borderRadius: '2rem' }}>Explorar Anúncios</Link>
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
                    title="Remover dos favoritos"
                    style={{ position: 'absolute', top: '.5rem', right: '.5rem', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-error)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--clr-text)', marginBottom: '.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.title_pt || ad.title_es}</div>
                  <div style={{ fontWeight: 700, color: 'var(--clr-primary-mid)', fontSize: '.95rem', marginBottom: '.5rem' }}>{fMoney(ad.price, ad.currency)}</div>
                  <Link href={`/anuncio/${ad.id}`} style={{ display: 'block', textAlign: 'center', padding: '.5rem', borderRadius: '.5rem', background: 'var(--clr-primary-pale)', color: 'var(--clr-primary-mid)', fontWeight: 700, fontSize: '.8rem', textDecoration: 'none' }}>
                    Ver anúncio →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999,
          background: 'var(--clr-error)', color: 'white', padding: '1rem 1.5rem',
          borderRadius: '0.75rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
          fontWeight: 600, animation: 'slideUp 0.3s ease-out forwards',
          display: 'flex', alignItems: 'center', gap: '0.75rem'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {toastMsg}
          <style>{`
            @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
        </div>
      )}
    </div>
  );
}
