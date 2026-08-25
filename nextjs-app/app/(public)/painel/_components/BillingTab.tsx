'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getMyBilling, getSupabase } from '@/lib/supabase';
import styles from '../painel.module.css';

export function BillingTab({ user, planMeta }: { user: any, planMeta: any }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [paymentPending, setPaymentPending] = useState(false);
  const PAGE_SIZE = 5;

  const plan = user.profile?.plan || 'free';
  const userId = user?.id as string | undefined;

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleCancelSubscription = async () => {
    if (!confirm('Tem certeza que deseja cancelar sua assinatura? Seu plano continuará ativo até o fim do período já pago.')) return;
    
    setIsCancelling(true);
    setCancelMessage(null);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar assinatura');
      
      setCancelMessage({ type: 'success', text: data.message || 'Assinatura cancelada com sucesso.' });
    } catch(err: any) {
      setCancelMessage({ type: 'error', text: err.message || 'Erro inesperado' });
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

  const approvedStatuses = ['approved', 'active', 'authorized', 'succeeded'];
  const filtered = billing.filter((tx: any) => {
    if (filter === 'approved') return approvedStatuses.includes(tx.status);
    if (filter === 'pending') return tx.status === 'pending';
    return true;
  });
  
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={styles.fadeIn}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className={styles.headerTitle}>Assinatura e Faturas</h1>
        <p className={styles.headerSubtitle}>Gerencie seu plano e histórico financeiro.</p>
      </div>

      {paymentPending && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '.85rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', color: '#065f46', fontSize: '.9rem', fontWeight: 600 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail.
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg,var(--clr-primary-mid),var(--clr-primary))', color: '#fff', borderRadius: '1rem', padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        <div style={{ flex: '1 1 200px', zIndex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.3rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Plano {planMeta.label}</div>
            <span style={{ fontSize: '.65rem', fontWeight: 800, background: 'rgba(255,255,255,.2)', padding: '.2rem .5rem', borderRadius: 4, letterSpacing: '.05em' }}>ATUAL</span>
          </div>
          <div style={{ fontSize: '.85rem', opacity: .85 }}>{planMeta.desc}</div>
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
              {isCancelling ? 'Cancelando...' : 'Cancelar Assinatura'}
            </button>
          )}
          <Link href="/planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.7rem 1.4rem', borderRadius: '.75rem', background: 'linear-gradient(135deg,var(--clr-accent),var(--clr-accent-dark))', color: '#fff', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none', boxShadow: '0 4px 15px rgba(245,158,11,.4)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Fazer Upgrade
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
            Histórico de Faturas
          </h3>
          <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className={styles.inputSelect}>
            <option value="all">Todas as Faturas</option>
            <option value="approved">Aprovadas</option>
            <option value="pending">Pendentes</option>
          </select>
        </div>

        {isLoading ? (
          <div className={styles.spinner} />
        ) : paged.length === 0 ? (
          <div className={styles.emptyState}>Nenhuma fatura encontrada.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paged.map((tx: any) => {
              const isApproved = approvedStatuses.includes(tx.status);
              const txId = tx.id ? tx.id.toString().split('-')[0] : '—';
              const d = new Date(tx.created_at).toLocaleDateString('pt-BR');
              const planName = tx.plan_type === 'subscription' ? 'Assinatura' : (tx.description || tx.plan_name || 'Pagamento');
              const amount = tx.amount ? 'R$ ' + parseFloat(tx.amount).toFixed(2).replace('.', ',') : '—';
              const country = user.profile?.country || 'BR';
              const payLink = tx.checkout_url || `/api/checkout?invoice_id=${tx.id}&country=${country}`;

              return (
                <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '1.5rem', alignItems: 'center', padding: '1.25rem 1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--clr-text)', fontSize: '1rem', marginBottom: '.15rem' }}>{planName}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--clr-text-muted)', fontWeight: 500 }}>{d} &bull; Fatura #{txId}</div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--clr-text)', fontSize: '1.05rem', marginBottom: '.2rem' }}>{amount}</div>
                    <div className={`${styles.statusBadge} ${isApproved ? styles.statusActive : (tx.status === 'pending' ? styles.statusPending : styles.statusExpired)}`}>
                      {isApproved ? 'Aprovado' : (tx.status === 'pending' ? 'Pendente' : 'Falhou')}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    {tx.status === 'pending' && (
                      <Link href={payLink} className={styles.primaryButton} style={{ padding: '.4rem .8rem' }}>
                        Pagar
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
              Anterior
            </button>
            <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={styles.secondaryButton}>
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
