'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getMyBilling, getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';
import { formatPrice } from '@/lib/currency';
import styles from '../painel.module.css';

const TRANSLATIONS = {
  pt: {
    title: 'Assinatura e Faturas', subtitle: 'Gerencie seu plano e histórico financeiro.',
    paymentPending: 'Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail.',
    plan: 'Plano', current: 'ATUAL',
    cancelling: 'Cancelando...', cancelSubscription: 'Cancelar Assinatura',
    upgrade: 'Fazer Upgrade',
    // BUG CORRIGIDO (feature aprovada pelo usuário): renomeado de "Histórico
    // de Faturas" — subscriptions não é um livro-razão de faturas (uma linha
    // por cobrança/mês), é o estado da(s) assinatura(s) do usuário. Chamar
    // de "fatura" seria inventar uma granularidade que o schema não tem.
    invoiceHistory: 'Histórico de Assinaturas',
    allInvoices: 'Todas', approved: 'Ativas', pending: 'Pendentes',
    noInvoices: 'Nenhuma assinatura encontrada.',
    subscription: 'Assinatura',
    statusApproved: 'Ativa', statusPending: 'Pendente', statusFailed: 'Inativa',
    statusPastDue: 'Pagamento atrasado', statusCancelling: 'Cancela ao fim do período',
    cycleMonthly: 'Mensal', cycleAnnual: 'Anual',
    nextBilling: 'Próxima cobrança', periodEnd: 'Válida até',
    continueCheckout: 'Continuar pagamento',
    prev: 'Anterior', next: 'Próxima',
    confirmCancel: 'Tem certeza que deseja cancelar sua assinatura? Seu plano continuará ativo até o fim do período já pago.',
    sessionExpired: 'Sessão expirada. Faça login novamente.',
    cancelError: 'Erro ao cancelar assinatura',
    cancelSuccess: 'Assinatura cancelada com sucesso.',
    unexpectedError: 'Erro inesperado',
  },
  es: {
    title: 'Suscripción y Facturas', subtitle: 'Gestiona tu plan e historial financiero.',
    paymentPending: 'Tu pago se está procesando. Recibirás una confirmación por correo electrónico.',
    plan: 'Plan', current: 'ACTUAL',
    cancelling: 'Cancelando...', cancelSubscription: 'Cancelar Suscripción',
    upgrade: 'Hacer Upgrade',
    invoiceHistory: 'Historial de Suscripciones',
    allInvoices: 'Todas', approved: 'Activas', pending: 'Pendientes',
    noInvoices: 'Ninguna suscripción encontrada.',
    subscription: 'Suscripción',
    statusApproved: 'Activa', statusPending: 'Pendiente', statusFailed: 'Inactiva',
    statusPastDue: 'Pago atrasado', statusCancelling: 'Cancela al final del período',
    cycleMonthly: 'Mensual', cycleAnnual: 'Anual',
    nextBilling: 'Próximo cobro', periodEnd: 'Válida hasta',
    continueCheckout: 'Continuar pago',
    prev: 'Anterior', next: 'Siguiente',
    confirmCancel: '¿Estás seguro de que deseas cancelar tu suscripción? Tu plan seguirá activo hasta el final del período ya pagado.',
    sessionExpired: 'Sesión expirada. Inicia sesión nuevamente.',
    cancelError: 'Error al cancelar la suscripción',
    cancelSuccess: 'Suscripción cancelada con éxito.',
    unexpectedError: 'Error inesperado',
  },
};

export function BillingTab({ user, planMeta }: { user: any, planMeta: any }) {
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [paymentPending, setPaymentPending] = useState(false);
  const PAGE_SIZE = 5;

  const plan = user.profile?.plan || 'free';
  const userId = user?.id as string | undefined;

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // planMeta vem do servidor só com as colunas PT (plans.name/description) —
  // busca aqui a linha correspondente em `plans` pra pegar name_es/description_es
  // (mesma fonte de verdade), com fallback pro texto PT se a tradução faltar.
  const [planI18n, setPlanI18n] = useState<{ name_es: string | null; description_es: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!planMeta?.label) return;
    getSupabase().from('plans').select('name_es, description_es').eq('name', planMeta.label).maybeSingle()
      .then((res: { data: { name_es: string | null; description_es: string | null } | null }) => { if (!cancelled) setPlanI18n(res.data || null); });
    return () => { cancelled = true };
  }, [planMeta?.label]);
  const planLabel = lang === 'es' && planI18n?.name_es ? planI18n.name_es : planMeta.label;

  // Mapa nome_pt -> nome_es de TODOS os planos, buscado uma única vez —
  // usado pra localizar sub.plan (guardado como o nome em PT, ex.
  // "Produtor PRO") em cada linha do histórico de assinaturas, sem
  // disparar uma query por linha.
  const [planNameEsByPt, setPlanNameEsByPt] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    getSupabase().from('plans').select('name, name_es').then((res: { data: { name: string; name_es: string | null }[] | null }) => {
      if (cancelled || !res.data) return;
      const map: Record<string, string> = {};
      res.data.forEach(p => { if (p.name_es) map[p.name] = p.name_es; });
      setPlanNameEsByPt(map);
    });
    return () => { cancelled = true };
  }, []);
  const localizedPlanName = (namePt: string) => (lang === 'es' && planNameEsByPt[namePt]) || namePt;
  const planDesc = lang === 'es' && planI18n?.description_es ? planI18n.description_es : planMeta.desc;

  const handleCancelSubscription = async () => {
    if (!confirm(t.confirmCancel)) return;

    setIsCancelling(true);
    setCancelMessage(null);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t.sessionExpired);
      }

      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.cancelError);

      setCancelMessage({ type: 'success', text: data.message || t.cancelSuccess });
    } catch(err: any) {
      setCancelMessage({ type: 'error', text: err.message || t.unexpectedError });
    } finally {
      setIsCancelling(false);
    }
  }

  // Detect payment=success param and show informational message only.
  // Actual payment status update is handled exclusively by server-side webhook.
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentPending(true);
      window.history.replaceState({}, '', '/painel#billing');
    }
  }, []);

  const { data: billing = [], isLoading } = useSWR(
    userId ? ['myBilling', userId] : null,
    () => getMyBilling()
  );

  const approvedStatuses = ['active', 'switch_applied'];
  const filtered = billing.filter((sub: any) => {
    if (filter === 'approved') return approvedStatuses.includes(sub.status);
    if (filter === 'pending') return sub.status === 'pending';
    return true;
  });
  
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={styles.fadeIn}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className={styles.headerTitle}>{t.title}</h1>
        <p className={styles.headerSubtitle}>{t.subtitle}</p>
      </div>

      {paymentPending && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '.85rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', color: '#065f46', fontSize: '.9rem', fontWeight: 600 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {t.paymentPending}
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg,var(--clr-primary-mid),var(--clr-primary))', color: '#fff', borderRadius: '1rem', padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        <div style={{ flex: '1 1 200px', zIndex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.3rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{t.plan} {planLabel}</div>
            <span style={{ fontSize: '.65rem', fontWeight: 800, background: 'rgba(255,255,255,.2)', padding: '.2rem .5rem', borderRadius: 4, letterSpacing: '.05em' }}>{t.current}</span>
          </div>
          <div style={{ fontSize: '.85rem', opacity: .85 }}>{planDesc}</div>
        </div>
        <div style={{ zIndex: 1, position: 'relative', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '2 1 400px' }}>
          {plan !== 'free' && (
            <button 
              onClick={handleCancelSubscription} 
              disabled={isCancelling || cancelMessage?.type === 'success'}
              style={{ 
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                color: '#fff', padding: '.7rem 1.4rem', borderRadius: '.75rem', fontWeight: 600, 
                fontSize: '.9rem', cursor: isCancelling || cancelMessage?.type === 'success' ? 'not-allowed' : 'pointer' 
              }}>
              {isCancelling ? t.cancelling : t.cancelSubscription}
            </button>
          )}
          <Link href="/planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.7rem 1.4rem', borderRadius: '.75rem', background: 'linear-gradient(135deg,var(--clr-accent),var(--clr-accent-dark))', color: '#fff', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none', boxShadow: '0 4px 15px rgba(245,158,11,.4)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {t.upgrade}
          </Link>
        </div>
      </div>

      {cancelMessage && (
        <div style={{
          marginBottom: '1.5rem', padding: '1rem 1.5rem', borderRadius: '.85rem', fontWeight: 600, fontSize: '.9rem',
          background: cancelMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${cancelMessage.type === 'success' ? '#6ee7b7' : '#fecaca'}`,
          color: cancelMessage.type === 'success' ? '#065f46' : '#991b1b',
        }}>
          {cancelMessage.type === 'success' ? '✅ ' : '⚠️ '}
          {cancelMessage.text}
        </div>
      )}

      <div className={styles.card} style={{ padding: '2rem' }}>
        <div className={styles.flexBetween}>
          <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '.6rem', margin: 0 }}>
            {t.invoiceHistory}
          </h3>
          <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className={styles.inputSelect}>
            <option value="all">{t.allInvoices}</option>
            <option value="approved">{t.approved}</option>
            <option value="pending">{t.pending}</option>
          </select>
        </div>

        {isLoading ? (
          <div className={styles.spinner} />
        ) : paged.length === 0 ? (
          <div className={styles.emptyState}>{t.noInvoices}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paged.map((sub: any) => {
              const isApproved = approvedStatuses.includes(sub.status);
              const isPending = sub.status === 'pending';
              const isPastDue = sub.status === 'past_due';
              const d = new Date(sub.created_at).toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR');
              const planName = localizedPlanName(sub.plan || t.subscription);
              const cycleLabel = sub.billing_cycle === 'annual' ? t.cycleAnnual : t.cycleMonthly;
              // BUG CORRIGIDO (revalidação do zero da auditoria de i18n):
              // símbolo/formatação de moeda reimplementados manualmente em
              // vez de delegar pra lib/currency.ts, único lugar do app com
              // essa lógica. Nem `transactions` nem `subscriptions` têm
              // coluna de moeda — usa o mesmo default 'BRL' que o resto do
              // app assume quando a moeda não é informada.
              const amount = sub.price ? formatPrice(parseFloat(sub.price), 'BRL', lang) : '—';
              const dateLabel = isApproved && sub.next_billing_at
                ? `${t.nextBilling}: ${new Date(sub.next_billing_at).toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR')}`
                : sub.current_period_end
                  ? `${t.periodEnd}: ${new Date(sub.current_period_end).toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR')}`
                  : d;

              return (
                <div key={sub.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '1.5rem', alignItems: 'center', padding: '1.25rem 1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--clr-text)', fontSize: '1rem', marginBottom: '.15rem' }}>{planName} &bull; {cycleLabel}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--clr-text-muted)', fontWeight: 500 }}>{dateLabel}</div>
                    {sub.cancel_at_period_end && (
                      <div style={{ fontSize: '.78rem', color: '#b45309', fontWeight: 600, marginTop: '.2rem' }}>{t.statusCancelling}</div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--clr-text)', fontSize: '1.05rem', marginBottom: '.2rem' }}>{amount}</div>
                    <div className={`${styles.statusBadge} ${isApproved ? styles.statusActive : ((isPending || isPastDue) ? styles.statusPending : styles.statusExpired)}`}>
                      {isApproved ? t.statusApproved : (isPending ? t.statusPending : (isPastDue ? t.statusPastDue : t.statusFailed))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    {isPending && (
                      <Link href="/planos" className={styles.primaryButton} style={{ padding: '.4rem .8rem' }}>
                        {t.continueCheckout}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--clr-border-light)' }}>
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
    </div>
  );
}
