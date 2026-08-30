'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { logout, getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';
import styles from './painel.module.css';

import { MyAdsTab } from './_components/MyAdsTab';
import { MessagesTab } from './_components/MessagesTab';
import { FavoritesTab } from './_components/FavoritesTab';
import { ProfileTab } from './_components/ProfileTab';
import { BillingTab } from './_components/BillingTab';

type Tab = 'ads' | 'messages' | 'favorites' | 'profile' | 'billing';

const TRANSLATIONS = {
  pt: {
    myAds: 'Meus Anúncios', messages: 'Mensagens', favorites: 'Favoritos',
    myProfile: 'Meu Perfil', billing: 'Assinatura e Faturas', logout: 'Sair',
    adsUsed: 'Anúncios usados', unlimited: 'Ilimitado',
    sections: 'Seções do painel',
    cancelledBanner: 'Assinatura não concluída. Você pode tentar novamente em Assinatura e Faturas.',
    successBanner: 'Assinatura ativada com sucesso! Seu plano já está ativo.',
    close: 'Fechar',
  },
  es: {
    myAds: 'Mis Anuncios', messages: 'Mensajes', favorites: 'Favoritos',
    myProfile: 'Mi Perfil', billing: 'Suscripción y Facturas', logout: 'Salir',
    adsUsed: 'Anuncios usados', unlimited: 'Ilimitado',
    sections: 'Secciones del panel',
    cancelledBanner: 'Suscripción no completada. Puedes intentarlo de nuevo en Suscripción y Facturas.',
    successBanner: '¡Suscripción activada con éxito! Tu plan ya está activo.',
    close: 'Cerrar',
  },
};

export default function PainelClient({ initialUser, initialStats, initialPlanMeta }: { initialUser: any, initialStats: any, initialPlanMeta: any }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt
  const validTabs: Tab[] = ['ads', 'messages', 'favorites', 'profile', 'billing']
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false)
  const [checkoutCancelled, setCheckoutCancelled] = useState(false)
  // planMeta vem do servidor (page.tsx) só com a coluna PT (plans.name).
  // Busca aqui a linha correspondente em `plans` só pra pegar o name_es —
  // plano gratuito/PRO/Premium são poucas linhas, cacheáveis, sem custo de
  // um novo endpoint dedicado.
  const [planLabelEs, setPlanLabelEs] = useState<string | null>(null)

  // Sempre nasce em 'ads', igual ao servidor (fragmentos de URL nunca chegam
  // ao servidor, então ele não tem como saber qual aba a URL pedia). A
  // versão anterior lia window.location.hash direto no useState — parecia
  // funcionar, mas causava hydration mismatch toda vez que alguém abria
  // /painel#messages (ou qualquer link com hash) direto: o servidor
  // renderizava 'ads', o cliente já nascia em outra aba, e o React
  // descartava a árvore inteira pra regenerar do zero (visível como
  // "Hydration failed" no console, sem nenhum erro visual óbvio pro
  // usuário — mas gastando um render inteiro à toa).
  const [activeTab, setActiveTab] = useState<Tab>('ads');

  // Lê a hash da URL uma vez ao montar, pra abrir já na aba certa quando a
  // própria URL pedir uma (link externo, bookmark, F5) — sem quebrar a
  // hidratação, por isso é useEffect e não o useState acima.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Tab
    if (validTabs.includes(hash)) setActiveTab(hash)
  }, [])

  // Troca de aba pedida de FORA deste componente — hoje só o Header, nos
  // links "Minhas Mensagens"/"Meus Anúncios"/"Assinatura e Faturas". Esses
  // links usam next/link para /painel#hash: como a rota não muda (já
  // estamos em /painel), o React não remonta este componente, então o
  // useEffect acima nunca roda de novo. 'hashchange' não ajuda (o next/link
  // não dispara esse evento nativo) e nem dá pra confiar em
  // history.pushState/Navigation API — o Header dispara este evento próprio
  // no onClick como sinal direto, sem depender de nenhum mecanismo interno
  // do framework.
  useEffect(() => {
    const onSwitchTab = (e: Event) => {
      const tab = (e as CustomEvent<Tab>).detail
      if (validTabs.includes(tab)) setActiveTab(tab)
    }
    window.addEventListener('painel:switchtab', onSwitchTab)
    return () => window.removeEventListener('painel:switchtab', onSwitchTab)
  }, [])

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
      const timer = setTimeout(() => setSubscriptionSuccess(false), 8000)
      return () => clearTimeout(timer)
    }
    if (searchParams.get('cancelled') === '1') {
      setCheckoutCancelled(true)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('cancelled')
        window.history.replaceState(null, '', url.toString())
      }
      const timer = setTimeout(() => setCheckoutCancelled(false), 6000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  // planMeta vem do servidor só com o nome PT (plans.name) — busca a
  // tradução ES da mesma linha (mesma fonte de verdade, `plans`) pra
  // mostrar o nome do plano corretamente com ES ativo.
  useEffect(() => {
    let cancelled = false
    if (!initialPlanMeta?.label) return
    getSupabase().from('plans').select('name_es').eq('name', initialPlanMeta.label).maybeSingle()
      .then((res: { data: { name_es?: string | null } | null }) => { if (!cancelled) setPlanLabelEs(res.data?.name_es || null) })
    return () => { cancelled = true }
  }, [initialPlanMeta?.label])

  // Props vindas do SSR — sem loading state necessário
  const user = initialUser;
  const planLabel = lang === 'es' && planLabelEs ? planLabelEs : initialPlanMeta?.label;

  // BUG CORRIGIDO (achado de usabilidade): adStats vinha só do SSR
  // (initialStats) e nunca revalidava no cliente — pausar, excluir ou
  // reativar um anúncio em MyAdsTab (que tem seu próprio SWR, com outra
  // chave) não refletia na cota mostrada aqui na sidebar até um F5.
  // Usa a mesma RPC get_user_ad_stats já chamada no servidor (page.tsx),
  // agora sob uma chave SWR compartilhada ('adStats', <userId>) que
  // MyAdsTab também invalida via mutate() global após qualquer ação que
  // mude o status de um anúncio.
  const { data: liveAdStats } = useSWR(
    user?.id ? ['adStats', user.id] : null,
    async () => {
      const { data, error } = await getSupabase().rpc('get_user_ad_stats', { p_user_id: user.id });
      if (error || !data || data.length === 0) return initialStats;
      return { total: data[0].total_ads || 0, active: data[0].active_ads || 0 };
    },
    { fallbackData: initialStats }
  );
  const adStats = liveAdStats || initialStats;

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '#' + tab);
  };

  const profile = user?.profile || {};
  const planMeta = initialPlanMeta;
  const name = profile.display_name || profile.name || user?.email?.split('@')[0] || 'Usuário';
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebarBtns: { id: Tab; icon: React.ReactNode; label: string }[] = [
    {
      id: 'ads', label: t.myAds,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    },
    {
      id: 'messages', label: t.messages,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    },
    {
      id: 'favorites', label: t.favorites,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    },
    {
      id: 'profile', label: t.myProfile,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    },
    {
      id: 'billing', label: t.billing,
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
          <span>{t.cancelledBanner}</span>
          <button onClick={() => setCheckoutCancelled(false)} aria-label={t.close}
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
          <span>{t.successBanner}</span>
          <button onClick={() => setSubscriptionSuccess(false)} aria-label={t.close}
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
            <div className={styles.sidebarPlan}>{planLabel}</div>
          </div>

          <div className={styles.sidebarUsage}>
            <div className={styles.sidebarUsageLabels}>
              <span>{t.adsUsed}</span>
              <span>{adStats.active} / {planMeta.unlimited ? t.unlimited : planMeta.ads}</span>
            </div>
            <div className={styles.sidebarUsageBar}>
              <div
                className={styles.sidebarUsageBarFill}
                style={{ width: planMeta.unlimited ? '100%' : `${Math.min(100, (adStats.active / planMeta.ads) * 100)}%` }}
              />
            </div>
          </div>

          <nav className={styles.sidebarNav}>
            {/* ARIA tablist on the nav button group */}
            <div role="tablist" aria-label={t.sections}>
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
            <button onClick={() => logout()} className={styles.sidebarLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              {t.logout}
            </button>
          </nav>
        </aside>

        {/* ARIA tabpanels — um por aba, sempre montados.
            BUG CORRIGIDO (varredura cruzada de cenários): antes, um único
            <div> trocava de conteúdo via `{activeTab === 'x' && <XTab/>}`,
            desmontando a aba anterior por completo — qualquer estado local
            não salvo (ex.: um rascunho de mensagem digitado em
            MessagesTab, um filtro em MyAdsTab) se perdia ao trocar de aba.
            Agora as 5 abas ficam sempre montadas, alternando visibilidade
            via `hidden` — decisão explícita do usuário, ciente de que isso
            significa todas buscando dados (e a subscription de Realtime de
            MessagesTab ficando sempre aberta) desde a abertura do painel,
            não só quando a aba é selecionada. */}
        {sidebarBtns.map(btn => (
          <div
            key={btn.id}
            role="tabpanel"
            id={`panel-${btn.id}`}
            aria-labelledby={`tab-${btn.id}`}
            tabIndex={0}
            hidden={activeTab !== btn.id}
            style={{ minWidth: 0 }}
          >
            {btn.id === 'ads'       && <MyAdsTab userId={user?.id} adStats={adStats} planMeta={planMeta} />}
            {btn.id === 'messages'  && <MessagesTab userId={user?.id} />}
            {btn.id === 'favorites' && <FavoritesTab userId={user?.id} />}
            {btn.id === 'profile'   && <ProfileTab user={user} />}
            {btn.id === 'billing'   && <BillingTab user={user} planMeta={planMeta} />}
          </div>
        ))}
      </div>
    </>
  );
}
