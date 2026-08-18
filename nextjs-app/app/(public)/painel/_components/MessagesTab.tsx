'use client';

import React, { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { getMyMessages, sendMessage, getSupabase } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import styles from '../painel.module.css';

function fDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function MessagesTab({ userId }: { userId: string }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);

  const { data: messages = [], isLoading, mutate } = useSWR(
    userId ? ['myMessages', userId] : null,
    () => getMyMessages()
  );

  // Supabase Realtime subscription — replaces 10s polling
  useEffect(() => {
    if (!userId) return;

    const channel = getSupabase()
      .channel(`messages_user_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          mutate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${userId}`,
        },
        () => {
          mutate();
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [userId, mutate]);

  const conversations = useMemo(() => {
    const convs: Record<string, any> = {};
    messages.forEach((msg: any) => {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      const key = `${msg.ad_id}__${otherId}`;
      const otherProfile = msg.sender_id === userId ? msg.receiver : msg.sender;
      if (!convs[key]) {
        convs[key] = { 
          key, 
          adId: msg.ad_id, 
          otherId, 
          otherName: otherProfile?.name || 'Usuário', 
          adTitle: msg.ads?.title_pt || 'Anúncio', 
          messages: [], 
          lastDate: msg.created_at 
        };
      }
      convs[key].messages.push(msg);
      if (msg.created_at > convs[key].lastDate) convs[key].lastDate = msg.created_at;
    });
    return convs;
  }, [messages, userId]);

  const sendMsg = async () => {
    const txt = inputMsg.trim();
    if (!txt || !activeKey) return;
    
    const conv = conversations[activeKey];
    setSending(true);
    
    try {
      await sendMessage(conv.adId, conv.otherId, txt);
      mutate(); // Trigger a refetch
      setInputMsg('');
    } catch {
      showToast('Erro ao enviar mensagem.', 'error');
    } finally {
      setSending(false);
    }
  };

  const convList = Object.values(conversations)
    .filter(c => !search || c.otherName.toLowerCase().includes(search.toLowerCase()) || c.adTitle.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  const activeConv = activeKey ? conversations[activeKey] : null;

  return (
    <div className={styles.fadeIn}>
      <div className={styles.flexBetween}>
        <div>
          <h1 className={styles.headerTitle}>Mensagens</h1>
          <p className={styles.headerSubtitle}>Conversas sobre seus anúncios</p>
        </div>
        {!activeConv && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-light)" strokeWidth="2.5" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Buscar conversas..."
              className={styles.formInput}
              style={{ paddingLeft: '2.8rem', borderRadius: '2rem' }}
            />
          </div>
        )}
      </div>

      {activeConv ? (
        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', height: 520, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--clr-border-light)' }}>
            <button onClick={() => setActiveKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)', padding: '.3rem', borderRadius: '.4rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--clr-text)' }}>{activeConv.otherName}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--clr-text-muted)' }}>{activeConv.adTitle}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--clr-bg-alt)' }}>
            {[...activeConv.messages].reverse().map((m: any) => {
              const isMine = m.sender_id === userId;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ 
                    maxWidth: '70%', 
                    padding: '.65rem 1rem', 
                    borderRadius: isMine ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0', 
                    background: isMine ? 'var(--clr-primary-mid)' : 'var(--clr-bg)', 
                    color: isMine ? '#fff' : 'var(--clr-text)', 
                    fontSize: '.9rem', 
                    boxShadow: 'var(--shadow-xs)' 
                  }}>
                    {m.content}
                    <div style={{ fontSize: '.7rem', opacity: .7, marginTop: '.3rem', textAlign: isMine ? 'right' : 'left' }}>{fDate(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.75rem 1.25rem', borderTop: '1px solid var(--clr-border-light)', background: 'var(--clr-bg)' }}>
            <textarea 
              value={inputMsg} 
              onChange={e => setInputMsg(e.target.value)} 
              placeholder="Digite sua mensagem…" 
              rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              className={styles.formInput}
              style={{ flex: 1, resize: 'none' }}
            />
            <button 
              onClick={sendMsg} 
              disabled={sending || !inputMsg.trim()}
              style={{ 
                width: 42, height: 42, borderRadius: '50%', background: 'var(--clr-primary-mid)', color: '#fff', 
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                cursor: 'pointer', flexShrink: 0, opacity: (sending || !inputMsg.trim()) ? 0.6 : 1 
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className={styles.spinner} />
      ) : convList.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="var(--clr-text-light)"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h3 className={styles.emptyStateTitle}>Nenhuma mensagem</h3>
          <p className={styles.emptyStateDesc}>Você ainda não tem conversas.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {convList.map(conv => {
            const lastMsg = conv.messages[0];
            const initials = conv.otherName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div 
                key={conv.key} 
                onClick={() => setActiveKey(conv.key)}
                className={styles.card}
                style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer' }}
              >
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--clr-primary-mid),var(--clr-primary))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--clr-text)', marginBottom: '.15rem' }}>{conv.otherName}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--clr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.adTitle}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--clr-text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '.1rem' }}>{lastMsg?.content}</div>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--clr-text-light)', flexShrink: 0 }}>{fDate(conv.lastDate)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
