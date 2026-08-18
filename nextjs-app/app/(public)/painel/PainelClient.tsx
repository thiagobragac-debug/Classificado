'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { logout, PLAN_META } from '@/lib/supabase';
import styles from './painel.module.css';

import { MyAdsTab } from './_components/MyAdsTab';
import { MessagesTab } from './_components/MessagesTab';
import { FavoritesTab } from './_components/FavoritesTab';
import { ProfileTab } from './_components/ProfileTab';
import { BillingTab } from './_components/BillingTab';

type Tab = 'ads' | 'messages' | 'favorites' | 'profile' | 'billing';

export default function PainelClient({ initialUser, initialStats }: { initialUser: any, initialStats: any }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const validTabs: Tab[] = ['ads', 'messages', 'favorites', 'profile', 'billing']
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false)
  const [checkoutCancelled, setCheckoutCancelled] = useState(false)

  // Lazy initializer: roda apenas no cliente, nunca no SSR — evita hydration mismatch
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'ads';
    const hash = window.location.hash.replace('#', '') as Tab;
    return validTabs.includes(hash) ? hash : 'ads';
  });

  // Show success banner if redirected from checkout
  useEffect(() => {
    if (searchParams.get('subscribed') === '1') {
      setSubscriptionSuccess(true)
      // Remove param from URL without reload
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('subscribed')
        window.history.replaceState(null, '', url.toString())
      }
      // Auto-hide after 8 seconds
      const t = setTimeout(() => setSubscriptionSuccess(false), 8000)
      return () => clearTimeout(t)
    }
    if (searchParams.get('cancelled') === '1') {
      setCheckoutCancelled(true)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('cancelled')
        window.history.replaceState(null, '', url.toString())
      }
      const t = setTimeout(() => setCheckoutCancelled(false), 6000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  // Props vindas do SSR — sem loading state necessário
  const user = initialUser;
  const adStats = initialStats;

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '#' + tab);
  };

  const profile = user?.profile || {};
  const plan = profile.plan || 'free';
  const planMeta = PLAN_META[plan] || PLAN_META.free;
  const name = profile.display_name || profile.name || user?.email?.split('@')[0] || 'Usuário';
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebarBtns: { id: Tab; icon: React.ReactNode; label: string }[] = [
    {
      id: 'ads', label: 'Meus Anúncios',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    },
    {
      id: 'messages', label: 'Mensagens',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    },
    {
      id: 'favorites', label: 'Favoritos',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    },
    {
      id: 'profile', label: 'Meu Perfil',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    },
    {
      id: 'billing', label: 'Assinatura e Faturas',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
    },
  ];

  return (
    <>
      {/* Cancelled banner — user abandoned Stripe checkout */}
      {checkoutCancelled && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#f59e0b', color: '#fff', padding: '12px 24px',
          borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 9999, fontWeight: 600, fontSize: '0.95rem',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span>⚠️</span>
          <span>Assinatura não concluída. Você pode tentar novamente em Assinatura e Faturas.</span>
          <button onClick={() => setCheckoutCancelled(false)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}
      {subscriptionSuccess && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#10b981', color: '#fff', padding: '12px 24px',
          borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 9999, fontWeight: 600, fontSize: '0.95rem',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span>✅</span>
          <span>Assinatura ativada com sucesso! Seu plano já está ativo.</span>
          <button onClick={() => setSubscriptionSuccess(false)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}
      <div className={styles.container}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarAvatar}>{initials}</div>
            <div className={styles.sidebarName}>{name}</div>
            <div className={styles.sidebarEmail}>{user?.email}</div>
            <div className={styles.sidebarPlan}>{planMeta.label}</div>
          </div>

          <div className={styles.sidebarUsage}>
            <div className={styles.sidebarUsageLabels}>
              <span>Anúncios usados</span>
              <span>{adStats.active} / {planMeta.ads === 999 ? 'Ilimitado' : planMeta.ads}</span>
            </div>
            <div className={styles.sidebarUsageBar}>
              <div
                className={styles.sidebarUsageBarFill}
                style={{ width: planMeta.ads === 999 ? '100%' : `${Math.min(100, (adStats.active / planMeta.ads) * 100)}%` }}
              />
            </div>
          </div>

          <nav className={styles.sidebarNav}>
            {/* ARIA tablist on the nav button group */}
            <div role="tablist" aria-label="Seções do painel">
              {sidebarBtns.map(btn => (
                <button
                  key={btn.id}
                  id={`tab-${btn.id}`}
                  role="tab"
                  aria-selected={activeTab === btn.id}
                  aria-controls={`panel-${btn.id}`}
                  onClick={() => switchTab(btn.id)}
                  className={`${styles.sidebarBtn} ${activeTab === btn.id ? styles.active : ''}`}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
            <div className={styles.sidebarDivider} />
            <button onClick={logout} className={styles.sidebarLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </nav>
        </aside>

        {/* ARIA tabpanel */}
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          style={{ minWidth: 0 }}
        >
          {activeTab === 'ads'       && <MyAdsTab userId={user?.id} />}
          {activeTab === 'messages'  && <MessagesTab userId={user?.id} />}
          {activeTab === 'favorites' && <FavoritesTab userId={user?.id} />}
          {activeTab === 'profile'   && <ProfileTab user={user} />}
          {activeTab === 'billing'   && <BillingTab user={user} />}
        </div>
      </div>
    </>
  );
}
