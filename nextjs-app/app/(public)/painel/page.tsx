'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getSession, getCurrentUser, logout,
  getMyAds, deleteAd, toggleAdStatus, getUserAdStats,
  getMyMessages, sendMessage,
  getMyFavorites, rpcToggleFav,
  updateProfile, getProfile, getMyBilling,
  PLAN_META, getSupabase
} from '@/lib/supabase'
import { resendVerificationEmail, uploadKycDocument } from '@/lib/supabase-panel'
import { useLang } from '@/lib/lang-context'
import Header from '@/components/Header'

// ─── TYPES ─────────────────────────────────────────────────────
type Tab = 'ads' | 'messages' | 'favorites' | 'profile' | 'billing'

function fDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return Math.floor(diff / 60) + 'min'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h'
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function fMoney(price: number | null | undefined, currency = 'BRL') {
  if (price == null) return '—'
  const sym: Record<string, string> = { BRL: 'R$', USD: 'US$', ARS: 'AR$', PYG: '₲', UYU: '$U' }
  const s = sym[currency] || currency
  return `${s} ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active:  { label: 'Ativo',     color: '#16a34a', bg: '#ecfdf5' },
  pending: { label: 'Pendente',  color: '#d97706', bg: '#fffbeb' },
  paused:  { label: 'Pausado',   color: '#64748b', bg: '#f1f5f9' },
  expired: { label: 'Expirado',  color: '#dc2626', bg: '#fef2f2' },
}

// ─── TOAST ─────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' | 'info' }) {
  const bg = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#1e293b'
  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, padding: '.85rem 1.25rem', borderRadius: '.85rem', background: bg, color: '#fff', fontSize: '.88rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', gap: '.6rem', maxWidth: 340, animation: 'fadeIn .3s ease' }}>
      {msg}
    </div>
  )
}

// ─── EMPTY STATE ────────────────────────────────────────────────
function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
        {icon}
      </div>
      <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b', marginBottom: '.5rem' }}>{title}</h3>
      <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: action ? '1.5rem' : 0 }}>{desc}</p>
      {action}
    </div>
  )
}

// ─── MY ADS TAB ────────────────────────────────────────────────
function MyAdsTab({ userId }: { userId: string }) {
  const [ads, setAds] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMyAds({ status: statusFilter, page, limit: 12 })
      setAds(res.data)
      setTotal(res.total)
    } catch (err: any) {
      console.error('MyAdsTab load error:', err)
      showToast('Erro ao carregar anúncios: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este anúncio?')) return
    try {
      await deleteAd(id)
      showToast('Anúncio excluído.', 'success')
      load()
    } catch {
      showToast('Erro ao excluir.', 'error')
    }
  }

  const handleToggle = async (id: string, status: string) => {
    try {
      const newStatus = await toggleAdStatus(id, status)
      showToast(newStatus === 'paused' ? 'Anúncio pausado.' : 'Anúncio reativado.', 'success')
      load()
    } catch {
      showToast('Erro ao alterar status.', 'error')
    }
  }

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push Notifications não são suportadas neste navegador.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Você bloqueou as notificações.');
        return;
      }
      const PUBLIC_VAPID_KEY = 'BFFlZaR5-TNTgn7UUkoMJivPREKDG5dY-Dg2I7eJopJSgNAZGzP4ZA01vQysGhp9zeR8qD3Yiyz_OBtq17Ux49g';
      const padding = '='.repeat((4 - PUBLIC_VAPID_KEY.length % 4) % 4);
      const base64 = (PUBLIC_VAPID_KEY + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray
      });
      const { data: { user } } = await getSupabase().auth.getUser();
      if (user) {
        const { error } = await getSupabase().from('push_subscriptions').insert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh') || new ArrayBuffer(0))))),
          auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth') || new ArrayBuffer(0)))))
        });
        if (error) alert('Erro ao salvar inscrição no banco.');
        else alert('Notificações ativadas com sucesso!');
      }
    } catch (err) {
      alert('Falha ao registrar Push.');
    }
  };

  const totalPages = Math.ceil(total / 12)

  return (
    <div>
      {toast && <Toast {...toast} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-text)' }}>Meus Anúncios</h1>
          <button onClick={handleSubscribePush} style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#fff', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem' }}>
            🔔 Ativar Notificações
          </button>
          <p style={{ color: '#64748b', fontSize: '.85rem', marginTop: '.2rem' }}>
            {loading ? 'Carregando...' : total === 0 ? 'Nenhum anúncio encontrado' : `${total} anúncio${total > 1 ? 's' : ''}`}
          </p>
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '.65rem 1rem', borderRadius: '.75rem', border: '1px solid #e2e8f0', background: '#fff', color: 'var(--clr-text)', fontSize: '.9rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
          <option value="all">Todos os Status</option>
          <option value="active">Ativos</option>
          <option value="pending">Pendentes</option>
          <option value="paused">Pausados</option>
          <option value="expired">Expirados</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#16a34a', animation: 'spin .7s linear infinite' }} />
        </div>
      ) : ads.length === 0 ? (
        <EmptyState
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
          title="Nenhum anúncio"
          desc={`Você não possui anúncios${statusFilter !== 'all' ? ' com este status.' : '.'}`}
          action={<Link href="/anunciar" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.7rem 1.4rem', borderRadius: '.75rem', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '.9rem', textDecoration: 'none' }}>Publicar anúncio</Link>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ads.map(ad => {
            const img = ad.images?.[0]
            const status = STATUS_LABELS[ad.status] || STATUS_LABELS.pending
            return (
              <div key={ad.id} style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,.04)', border: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', transition: 'all .2s' }}
                onMouseOver={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
                onMouseOut={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.04)')}>
                {/* Imagem */}
                <div style={{ width: 110, height: 82, borderRadius: '.6rem', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                  {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem' }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: status.bg, color: status.color }}>{status.label}</span>
                    {ad.featured && <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#fef9c3', color: '#a16207' }}>⭐ Destaque</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#1e293b', marginBottom: '.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {ad.title_pt || ad.title_es}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '.8rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{fMoney(ad.price, ad.currency)}</span>
                    {ad.city && <span>{ad.city}{ad.state ? `, ${ad.state}` : ''}</span>}
                    <span>👁 {ad.views_count || 0} views</span>
                    <span>{fDate(ad.created_at)}</span>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '.5rem', flexShrink: 0 }}>
                  <Link href={`/anunciar?id=${ad.id}`} title="Editar"
                    style={{ width: 36, height: 36, borderRadius: '.5rem', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', transition: 'all .2s' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Link>
                  <button title={ad.status === 'paused' ? 'Reativar' : 'Pausar'}
                    onClick={() => handleToggle(ad.id, ad.status)}
                    style={{ width: 36, height: 36, borderRadius: '.5rem', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', transition: 'all .2s' }}>
                    {ad.status === 'paused'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    }
                  </button>
                  <button title="Excluir" onClick={() => handleDelete(ad.id)}
                    style={{ width: 36, height: 36, borderRadius: '.5rem', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', transition: 'all .2s' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#fff', color: page <= 1 ? '#94a3b8' : '#475569', fontWeight: 600, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
            ← Anterior
          </button>
          <span style={{ fontSize: '.85rem', fontWeight: 700, color: '#64748b' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#fff', color: page >= totalPages ? '#94a3b8' : '#475569', fontWeight: 600, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MESSAGES TAB ──────────────────────────────────────────────
function MessagesTab({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [conversations, setConversations] = useState<Record<string, any>>({})
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [inputMsg, setInputMsg] = useState('')
  const [sending, setSending] = useState(false)

  const groupConvs = useCallback((msgs: any[]) => {
    const convs: Record<string, any> = {}
    msgs.forEach(msg => {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      const key = `${msg.ad_id}__${otherId}`
      const otherProfile = msg.sender_id === userId ? msg.receiver : msg.sender
      if (!convs[key]) {
        convs[key] = { key, adId: msg.ad_id, otherId, otherName: otherProfile?.name || 'Usuário', adTitle: msg.ads?.title_pt || 'Anúncio', messages: [], lastDate: msg.created_at }
      }
      convs[key].messages.push(msg)
      if (msg.created_at > convs[key].lastDate) convs[key].lastDate = msg.created_at
    })
    setConversations(convs)
  }, [userId])

  useEffect(() => {
    getMyMessages().then(msgs => { setMessages(msgs); groupConvs(msgs) }).catch(() => {}).finally(() => setLoading(false))
  }, [groupConvs])

  const sendMsg = async () => {
    const txt = inputMsg.trim()
    if (!txt || !activeKey) return
    const conv = conversations[activeKey]
    setSending(true)
    try {
      const m = await sendMessage(conv.adId, conv.otherId, txt)
      const updated = [...messages, { ...m, sender: { name: 'Eu' }, receiver: { name: conv.otherName }, ads: { title_pt: conv.adTitle }, sender_id: userId }]
      setMessages(updated)
      groupConvs(updated)
      setInputMsg('')
    } catch { /* silent */ } finally { setSending(false) }
  }

  const convList = Object.values(conversations)
    .filter(c => !search || c.otherName.toLowerCase().includes(search.toLowerCase()) || c.adTitle.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))

  const activeConv = activeKey ? conversations[activeKey] : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-text)' }}>Mensagens</h1>
          <p style={{ color: '#64748b', fontSize: '.85rem', marginTop: '.2rem' }}>Conversas sobre seus anúncios</p>
        </div>
        {!activeConv && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversas..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '.75rem 1rem .75rem 2.8rem', borderRadius: '2rem', border: '1px solid #e2e8f0', background: '#fff', fontSize: '.9rem', outline: 'none', color: '#0f172a' }} />
          </div>
        )}
      </div>

      {activeConv ? (
        <div style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
            <button onClick={() => setActiveKey(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '.3rem', borderRadius: '.4rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--clr-text)' }}>{activeConv.otherName}</div>
              <div style={{ fontSize: '.75rem', color: '#64748b' }}>{activeConv.adTitle}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
            {[...activeConv.messages].reverse().map((m: any) => {
              const isMine = m.sender_id === userId
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '70%', padding: '.65rem 1rem', borderRadius: isMine ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0', background: isMine ? '#16a34a' : '#fff', color: isMine ? '#fff' : '#1e293b', fontSize: '.9rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
                    {m.content}
                    <div style={{ fontSize: '.7rem', opacity: .7, marginTop: '.3rem', textAlign: isMine ? 'right' : 'left' }}>{fDate(m.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.75rem 1.25rem', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
            <textarea value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Digite sua mensagem…" rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '.65rem', padding: '.6rem 1rem', fontSize: '.88rem', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }} />
            <button onClick={sendMsg} disabled={sending || !inputMsg.trim()}
              style={{ width: 42, height: 42, borderRadius: '50%', background: '#16a34a', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#16a34a', animation: 'spin .7s linear infinite' }} />
        </div>
      ) : convList.length === 0 ? (
        <EmptyState
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          title="Nenhuma mensagem"
          desc="Você ainda não tem conversas."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {convList.map(conv => {
            const lastMsg = conv.messages[0]
            const initials = conv.otherName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div key={conv.key} onClick={() => setActiveKey(conv.key)}
                style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,.04)', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all .2s' }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.04)'; e.currentTarget.style.transform = 'none' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>{initials}</div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1e293b', marginBottom: '.15rem' }}>{conv.otherName}</div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.adTitle}</div>
                  <div style={{ fontSize: '.78rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '.1rem' }}>{lastMsg?.content}</div>
                </div>
                <div style={{ fontSize: '.75rem', color: '#94a3b8', flexShrink: 0 }}>{fDate(conv.lastDate)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── FAVORITES TAB ─────────────────────────────────────────────
function FavoritesTab({ userId }: { userId: string }) {
  const [favs, setFavs] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyFavorites().then(setFavs).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleRemove = async (adId: string) => {
    try {
      await rpcToggleFav(adId)
      setFavs(f => f.filter(a => a.id !== adId))
    } catch { /* silent */ }
  }

  const filtered = favs.filter(ad => !search || (ad.title_pt || '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-text)' }}>Favoritos</h1>
          <p style={{ color: '#64748b', fontSize: '.85rem', marginTop: '.2rem' }}>Anúncios que você salvou</p>
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar favoritos..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '.75rem 1rem .75rem 2.8rem', borderRadius: '2rem', border: '1px solid #e2e8f0', background: '#fff', fontSize: '.9rem', outline: 'none', color: '#0f172a' }} />
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#16a34a', animation: 'spin .7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
          title="Nenhum favorito"
          desc="Você não salvou nenhum anúncio ainda."
          action={<Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.7rem 1.4rem', borderRadius: '.75rem', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '.9rem', textDecoration: 'none' }}>Ver anúncios</Link>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {filtered.filter(Boolean).map(ad => {
            const img = ad.images?.[0]
            return (
              <div key={ad.id} style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,.04)', border: '1px solid #f1f5f9', overflow: 'hidden', transition: 'all .2s' }}
                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.1)'; e.currentTarget.style.transform = 'translateY(-4px)' }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.04)'; e.currentTarget.style.transform = 'none' }}>
                <div style={{ height: 140, background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                  {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <button onClick={() => handleRemove(ad.id)}
                    title="Remover dos favoritos"
                    style={{ position: 'absolute', top: '.5rem', right: '.5rem', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1e293b', marginBottom: '.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.title_pt || ad.title_es}</div>
                  <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '.95rem', marginBottom: '.5rem' }}>{fMoney(ad.price, ad.currency)}</div>
                  <Link href={`/anuncio/${ad.id}`} style={{ display: 'block', textAlign: 'center', padding: '.5rem', borderRadius: '.5rem', background: '#ecfdf5', color: '#16a34a', fontWeight: 700, fontSize: '.8rem', textDecoration: 'none' }}>
                    Ver anúncio →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── PROFILE TAB ───────────────────────────────────────────────
function ProfileTab({ user }: { user: any }) {
  const [form, setForm] = useState({
    name: '', display_name: '', phone_whatsapp: '', document_number: '',
    zip_code: '', street: '', number: '', complement: '', neighborhood: '',
    city: '', state: '', country: 'BR', bio: ''
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  useEffect(() => {
    const p = user.profile || {}
    setForm({
      name: p.name || '',
      display_name: p.display_name || '',
      phone_whatsapp: p.phone_whatsapp || '',
      document_number: p.document_number || '',
      zip_code: p.zip_code || '',
      street: p.street || '',
      number: p.number || '',
      complement: p.complement || '',
      neighborhood: p.neighborhood || '',
      city: p.city || '',
      state: p.state || '',
      country: p.country || 'BR',
      bio: p.bio || '',
    })
  }, [user])

  const [docFile, setDocFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [kycLoading, setKycLoading] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const handleCep = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '')
    if (cep.length === 8 && form.country === 'BR') {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
        const data = await res.json()
        if (!data.erro) {
          setForm(f => ({
            ...f,
            street: f.street || data.logradouro || '',
            neighborhood: f.neighborhood || data.bairro || '',
            city: f.city || data.localidade || '',
            state: f.state || data.uf || '',
          }))
        }
      } catch { /* silent */ }
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      showToast('Perfil salvo com sucesso!', 'success')
    } catch {
      showToast('Erro ao salvar perfil.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleResendEmail = async () => {
    if (!user.email) return;
    try {
      await resendVerificationEmail(user.email);
      showToast('E-mail de confirmação reenviado!', 'success');
    } catch {
      showToast('Erro ao reenviar e-mail.', 'error');
    }
  }

  const handleKycSubmit = async () => {
    if (!docFile || !selfieFile) {
      showToast('Selecione os dois arquivos antes de enviar.', 'error');
      return;
    }
    setKycLoading(true);
    showToast('Enviando documentos...', 'info');
    try {
      await uploadKycDocument(docFile, selfieFile);
      showToast('Documentos enviados para análise!', 'success');
      // Update local user state immediately to reflect 'pending'
      if (user.profile) user.profile.kyc_status = 'pending';
    } catch {
      showToast('Erro ao enviar documentos.', 'error');
    } finally {
      setKycLoading(false);
    }
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '.8rem 1rem', borderRadius: '.75rem', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '.95rem', fontFamily: 'inherit', outline: 'none', transition: 'all .2s', color: '#0f172a' }
  const labelStyle = { fontSize: '.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '.4rem' }

  return (
    <div>
      {toast && <Toast {...toast} />}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-text)' }}>Meu Perfil</h1>
        <p style={{ color: '#64748b', fontSize: '.85rem', marginTop: '.2rem' }}>Informações da sua conta</p>
      </div>
      <div className="profile-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)', padding: '1.5rem' }}>
          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1rem' }}>Dados Pessoais</p>
          <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.25rem' }}>
            <div>
              <label style={labelStyle}>Nome completo</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Seu nome" required style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>Nome de Exibição / Fazenda</label>
              <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Ex: Fazenda São João" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>CPF / CNPJ</label>
              <input value={form.document_number} onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))} placeholder="000.000.000-00" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>WhatsApp / Telefone</label>
              <input value={form.phone_whatsapp} onChange={e => setForm(f => ({ ...f, phone_whatsapp: e.target.value }))} placeholder="+55 (99) 9 9999-9999" type="tel" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>{form.country === 'BR' ? 'CEP' : 'Código Postal'}</label>
              <input value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} onBlur={handleCep} placeholder="00000-000" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }} />
            </div>
            <div>
              <label style={labelStyle}>Endereço (Rua/Av)</label>
              <input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} placeholder="Ex: Av. Brasil" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>Número</label>
              <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="Ex: 1000" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>Complemento</label>
              <input value={form.complement} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} placeholder="Apto, Sala, Bloco..." style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>Bairro</label>
              <input value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} placeholder="Seu bairro" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>Cidade</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Sua cidade" style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>{form.country === 'BR' ? 'Estado (UF)' : 'Província / Departamento'}</label>
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder={form.country === 'BR' ? 'Ex: SP, MT...' : 'Ex: Buenos Aires'} style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={labelStyle}>País</label>
              <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="BR">🇧🇷 Brasil</option>
                <option value="AR">🇦🇷 Argentina</option>
                <option value="PY">🇵🇾 Paraguai</option>
                <option value="UY">🇺🇾 Uruguai</option>
                <option value="BO">🇧🇴 Bolívia</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Bio / Apresentação</label>
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} placeholder="Conte sobre você ou sua propriedade…"
                style={{ ...inputStyle, resize: 'vertical' }}
                onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px #16a34a1a' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none' }} />
            </div>
          </div>
        </form>
      </div>

      <div style={{ background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)', padding: '2rem' }}>
        <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1rem' }}>Verificação KYC</p>
        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Complete as verificações abaixo para ganhar o selo de Vendedor Ouro e aumentar suas vendas.</p>

        <div style={{ display: 'flex', gap: '1.5rem', flexDirection: 'column' }}>
          {/* EMAIL */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '.85rem', background: '#fff', transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.02)' }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = '#cbd5e1' }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.02)'; e.currentTarget.style.borderColor = '#e2e8f0' }}>
            <div style={{ background: '#ecfdf5', padding: '.75rem', borderRadius: '50%' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>E-mail</h3>
                {user.email ? (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#ecfdf5', color: '#16a34a' }}>Verificado</span>
                ) : (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#fffbeb', color: '#d97706' }}>Pendente</span>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: '1rem' }}>Verifique seu endereço de e-mail para receber notificações e contatos.</p>
              {!user.email && (
                <button type="button" onClick={handleResendEmail}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '.65rem', borderRadius: '.5rem', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.04)', transition: 'all .2s' }}
                  onMouseOver={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)' }}
                  onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,.04)' }}>
                  Reenviar e-mail
                </button>
              )}
            </div>
          </div>

          {/* WHATSAPP */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '.85rem', background: '#fff', transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.02)' }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = '#cbd5e1' }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.02)'; e.currentTarget.style.borderColor = '#e2e8f0' }}>
            <div style={{ background: form.phone_whatsapp ? '#ecfdf5' : '#fef9c3', padding: '.75rem', borderRadius: '50%' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={form.phone_whatsapp ? '#10b981' : '#d97706'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>WhatsApp</h3>
                {form.phone_whatsapp ? (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#ecfdf5', color: '#16a34a' }}>Verificado</span>
                ) : (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#fffbeb', color: '#d97706' }}>Pendente</span>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: '1rem' }}>Confirme seu WhatsApp para que os compradores confiem em você.</p>
              {!form.phone_whatsapp && (
                <a href={`https://wa.me/5500000000000?text=${encodeURIComponent('Olá, quero verificar meu WhatsApp no Tauze Class. Meu e-mail é: ' + (user.email || ''))}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '.65rem', borderRadius: '.5rem', background: 'linear-gradient(to right, #16a34a, #15803d)', color: '#fff', fontSize: '.85rem', fontWeight: 700, textDecoration: 'none', gap: '.5rem', boxShadow: '0 4px 12px rgba(22,163,74,.3)', transition: 'all .2s' }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22,163,74,.4)' }}
                  onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,163,74,.3)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.122 1.523 5.855L.057 23.268a.5.5 0 0 0 .618.635l5.579-1.461A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.924 0-3.72-.523-5.256-1.43l-.377-.224-3.914 1.025 1.044-3.81-.246-.393A9.716 9.716 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg> Verificar WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* IDENTIDADE */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '.85rem', background: '#fff', transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.02)' }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = '#cbd5e1' }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.02)'; e.currentTarget.style.borderColor = '#e2e8f0' }}>
            <div style={{ background: (user.profile?.kyc_status === 'approved') ? '#ecfdf5' : '#fef2f2', padding: '.75rem', borderRadius: '50%' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={(user.profile?.kyc_status === 'approved') ? '#10b981' : '#dc2626'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>Identidade (Selo Ouro)</h3>
                {(user.profile?.kyc_status === 'approved') ? (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#ecfdf5', color: '#16a34a' }}>Aprovado</span>
                ) : (user.profile?.kyc_status === 'pending') ? (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#fffbeb', color: '#d97706' }}>Em Análise</span>
                ) : (
                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '.2rem .6rem', borderRadius: '99px', background: '#fef2f2', color: '#dc2626' }}>Não Enviado</span>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: '1rem' }}>Envie seu RG/CNH e uma selfie para ganhar o selo de vendedor verificado.</p>
              
              {(!user.profile?.kyc_status || !['pending', 'approved'].includes(user.profile?.kyc_status)) && (
                <>
                  <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '.75rem', width: '100%', boxSizing: 'border-box' }}>
                    <label htmlFor="kyc-doc-file" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem', border: '1.5px dashed #cbd5e1', borderRadius: '.75rem', cursor: 'pointer', background: '#f8fafc', boxSizing: 'border-box', minWidth: 0, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#ecfdf5'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px -3px rgba(16, 185, 129, 0.1)' }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                      <div className="icon-wrap" style={{ background: '#fff', padding: '.4rem', borderRadius: '.5rem', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)', flexShrink: 0, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>Documento</span>
                        <span style={{ fontSize: '.65rem', color: docFile ? '#10b981' : '#94a3b8', fontWeight: docFile ? 800 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, marginTop: '.15rem' }}>{docFile ? docFile.name : 'RG/CNH'}</span>
                      </div>
                      <input type="file" id="kyc-doc-file" accept="image/*" style={{ display: 'none' }} onChange={e => setDocFile(e.target.files?.[0] || null)} />
                    </label>
                    <label htmlFor="kyc-selfie-file" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem', border: '1.5px dashed #cbd5e1', borderRadius: '.75rem', cursor: 'pointer', background: '#f8fafc', boxSizing: 'border-box', minWidth: 0, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#ecfdf5'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px -3px rgba(16, 185, 129, 0.1)' }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                      <div className="icon-wrap" style={{ background: '#fff', padding: '.4rem', borderRadius: '.5rem', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)', flexShrink: 0, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>Selfie</span>
                        <span style={{ fontSize: '.65rem', color: selfieFile ? '#10b981' : '#94a3b8', fontWeight: selfieFile ? 800 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, marginTop: '.15rem' }}>{selfieFile ? selfieFile.name : 'Rosto claro'}</span>
                      </div>
                      <input type="file" id="kyc-selfie-file" accept="image/*" style={{ display: 'none' }} onChange={e => setSelfieFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                  <button type="button" onClick={handleKycSubmit} disabled={kycLoading}
                    style={{ marginTop: '.75rem', width: '100%', boxSizing: 'border-box', padding: '.85rem 1.5rem', borderRadius: '.65rem', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: '.85rem', border: 'none', cursor: kycLoading ? 'wait' : 'pointer', opacity: kycLoading ? 0.7 : 1, boxShadow: '0 4px 12px rgba(15,23,42,.15)', transition: 'all .2s' }}>
                    {kycLoading ? 'Enviando...' : 'Enviar Documentos'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

// ─── BILLING TAB ───────────────────────────────────────────────
function BillingTab({ user }: { user: any }) {
  const [billing, setBilling] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 5

  const plan = user.profile?.plan || 'free'
  const planMeta = PLAN_META[plan] || PLAN_META.free

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const invoiceId = searchParams.get('invoice_id');
    const payment = searchParams.get('payment');
    
    if (payment === 'success' && invoiceId) {
      // Simulate backend webhook / DB update
      import('@/lib/supabase').then(({ getSupabase }) => {
        getSupabase().from('payments').update({ status: 'approved' }).eq('id', invoiceId)
        .then(() => {
          // clean url
          window.history.replaceState({}, '', '/painel');
          getMyBilling().then(setBilling);
        });
      });
    } else {
      getMyBilling().then(setBilling).catch(() => {}).finally(() => setLoading(false))
    }
  }, [])

  const approvedStatuses = ['approved', 'active', 'authorized', 'succeeded']
  const filtered = billing.filter(tx => {
    if (filter === 'approved') return approvedStatuses.includes(tx.status)
    if (filter === 'pending') return tx.status === 'pending'
    return true
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--clr-text)', letterSpacing: '-0.03em' }}>Assinatura e Faturas</h1>
        <p style={{ color: '#64748b', fontSize: '.95rem', marginTop: '.3rem' }}>Gerencie seu plano e histórico financeiro.</p>
      </div>

      {/* Plan Card */}
      <div style={{ background: 'linear-gradient(135deg,#16a34a,#059669)', color: '#fff', borderRadius: '1rem', padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        <div style={{ flex: '1 1 200px', zIndex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.3rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Plano {planMeta.label}</div>
            <span style={{ fontSize: '.65rem', fontWeight: 800, background: 'rgba(255,255,255,.2)', padding: '.2rem .5rem', borderRadius: 4, letterSpacing: '.05em' }}>ATUAL</span>
          </div>
          <div style={{ fontSize: '.85rem', opacity: .85 }}>{planMeta.desc}</div>
        </div>

        <div style={{ zIndex: 1, position: 'relative', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '2 1 400px' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ width: 160 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', fontWeight: 700, marginBottom: '.4rem', gap: '.5rem' }}>
                <span>Anúncios</span>
                <span style={{ whiteSpace: 'nowrap' }}>- / {planMeta.ads === 999 ? 'Ilimitado' : planMeta.ads}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#fff', borderRadius: 99, width: '0%', transition: 'width .5s' }} />
              </div>
            </div>
            {planMeta.featured > 0 && (
              <div style={{ width: 160 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', fontWeight: 700, marginBottom: '.4rem', gap: '.5rem' }}>
                  <span>Destaques</span>
                  <span style={{ whiteSpace: 'nowrap' }}>- / {planMeta.featured}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#fff', borderRadius: 99, width: '0%', transition: 'width .5s' }} />
                </div>
              </div>
            )}
          </div>
          <Link href="/planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.7rem 1.4rem', borderRadius: '.75rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none', boxShadow: '0 4px 15px rgba(245,158,11,.4)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Fazer Upgrade
          </Link>
        </div>
      </div>

      {/* Invoice List */}
      <div style={{ background: '#fff', borderRadius: '1.25rem', boxShadow: '0 4px 20px rgba(0,0,0,.04)', padding: '2rem', border: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '.6rem', margin: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#64748b' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Histórico de Faturas
          </h3>
          <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1) }}
            style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '.9rem', fontWeight: 600, color: '#475569', outline: 'none', cursor: 'pointer' }}>
            <option value="all">Todas as Faturas</option>
            <option value="approved">Aprovadas</option>
            <option value="pending">Pendentes</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Carregando faturas...</div>
        ) : paged.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '.95rem', fontWeight: 500 }}>Nenhuma fatura encontrada.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paged.map((tx: any) => {
              const isApproved = approvedStatuses.includes(tx.status);
              const sColor = isApproved ? '#16a34a' : (tx.status === 'pending' ? '#d97706' : '#dc2626');
              const sText = isApproved ? 'Aprovado' : (tx.status === 'pending' ? 'Pendente' : 'Falhou');
              const txId = tx.id ? tx.id.toString().split('-')[0] : '—';
              const d = new Date(tx.created_at).toLocaleDateString('pt-BR');
              const planName = tx.plan_type === 'subscription' ? 'Assinatura' : (tx.description || tx.plan_name || 'Pagamento');
              const amount = tx.amount ? 'R$ ' + parseFloat(tx.amount).toFixed(2).replace('.', ',') : '—';
              const country = user.profile?.country || 'BR';
              const payLink = tx.checkout_url || `/api/checkout?invoice_id=${tx.id}&country=${country}`;

              return (
                <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '1.5rem', alignItems: 'center', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', borderRadius: '.85rem', background: '#fff', transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.02)', marginBottom: '.75rem', cursor: 'default' }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                  onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.02)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
                  
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </div>
                  
                  <div>
                    <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1rem', marginBottom: '.15rem' }}>{planName}</div>
                    <div style={{ fontSize: '.8rem', color: '#64748b', fontWeight: 500 }}>{d} &bull; Fatura #{txId}</div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem .8rem', background: '#f8fafc', borderRadius: '2rem', border: '1px solid #e2e8f0', fontSize: '.75rem', color: '#475569', fontWeight: 600 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                    Cartão
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.05rem', marginBottom: '.2rem' }}>{amount}</div>
                    <div style={{ fontSize: '.7rem', fontWeight: 800, color: sColor, padding: '.2rem .6rem', background: sColor + '18', borderRadius: '.3rem', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '.5px' }}>{sText}</div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    {tx.status === 'pending' ? (
                      <Link href={payLink} style={{ marginTop: '.4rem', display: 'inline-block', padding: '.3rem .75rem', background: '#1e293b', color: '#fff', fontSize: '.72rem', fontWeight: 700, borderRadius: '.4rem', textDecoration: 'none' }}>
                        Pagar agora
                      </Link>
                    ) : (
                      <button style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}
                        onMouseOver={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                        title="Baixar Fatura">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '.85rem', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
              Anterior
            </button>
            <span style={{ fontSize: '.85rem', fontWeight: 700, color: '#64748b' }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              style={{ padding: '.5rem 1rem', borderRadius: '.5rem', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '.85rem', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────
export default function PainelPage() {
  const router = useRouter()
  const { lang } = useLang()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('ads')
  const [adStats, setAdStats] = useState({ total: 0, active: 0 })

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') as Tab : 'ads'
    const validTabs: Tab[] = ['ads', 'messages', 'favorites', 'profile', 'billing']
    if (validTabs.includes(hash)) setActiveTab(hash)
  }, [])

  useEffect(() => {
    getSession().then(session => {
      if (!session) { router.push('/login'); return }
      getCurrentUser().then(u => { 
        setUser(u); 
        setLoading(false);
        if (u) {
          getUserAdStats(u.id).then(stats => setAdStats(stats || { total: 0, active: 0 })).catch(() => {});
        }
      }).catch(() => { router.push('/login') })
    }).catch(() => { router.push('/login') })
  }, [router])

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '#' + tab)
  }

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#16a34a', animation: 'spin .7s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </>
    )
  }

  const profile = user?.profile || {}
  const plan = profile.plan || 'free'
  const planMeta = PLAN_META[plan] || PLAN_META.free
  const name = profile.display_name || profile.name || user?.email?.split('@')[0] || 'Usuário'
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

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
  ]

  return (
    <>
      <Header />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .sidebar-btn { transition: all 0.2s !important; border: none; width: 100%; text-align: left; background: transparent; color: #64748b; margin-bottom: .25rem; display: flex; align-items: center; justify-content: flex-start; gap: .7rem; padding: .75rem 1rem; border-radius: .75rem; font-size: .9rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        .sidebar-btn:not(.active):hover { background: #f8fafc; color: #1e293b; transform: translateX(4px); }
        .sidebar-btn.active { background: #ecfdf5 !important; color: #16a34a !important; }
        @media (max-width: 860px) { .painel-wrap { grid-template-columns: 1fr !important; } }
        @media (max-width: 640px) { .profile-two-col { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="painel-wrap" style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.75rem', paddingTop: 'calc(var(--header-h, 70px) + 2rem)', paddingBottom: '4rem', maxWidth: 'var(--container-max)', width: '100%', margin: '0 auto', paddingLeft: 'var(--container-px)', paddingRight: 'var(--container-px)', alignItems: 'start' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ background: '#fff', borderRadius: '1.25rem', boxShadow: '0 2px 16px rgba(0,0,0,.06)', overflow: 'hidden', position: 'sticky', top: 'calc(var(--header-h, 70px) + 1.5rem)' }}>
          {/* Header verde */}
          <div style={{ background: 'linear-gradient(135deg,#16a34a,#059669)', padding: '2rem 1.5rem 2.5rem', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 24, background: '#fff', borderRadius: '1.25rem 1.25rem 0 0' }} />
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,.2)', border: '3px solid rgba(255,255,255,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 800, color: '#fff', margin: '0 auto 1rem' }}>{initials}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '.25rem' }}>{name}</div>
            <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, margin: '0 auto' }}>{user?.email}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '.75rem', padding: '.25rem .85rem', borderRadius: '2rem', fontSize: '.75rem', fontWeight: 700, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>{planMeta.label}</div>
          </div>

          {/* Barra de uso */}
          <div style={{ padding: '.85rem 1.5rem .5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: '#64748b', marginBottom: '.4rem' }}>
              <span>Anúncios usados</span>
              <span>{adStats.active} / {planMeta.ads === 999 ? 'Ilimitado' : planMeta.ads}</span>
            </div>
            <div style={{ height: 6, background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg,#16a34a,#22c55e)', width: planMeta.ads === 999 ? '100%' : `${Math.min(100, (adStats.active / planMeta.ads) * 100)}%`, transition: 'width .6s ease' }} />
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding: '.75rem .5rem 1.5rem' }}>
            {sidebarBtns.map(btn => (
              <button key={btn.id} onClick={() => switchTab(btn.id)} className={`sidebar-btn${activeTab === btn.id ? ' active' : ''}`}>
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: '#f1f5f9', margin: '.5rem 0' }} />
            <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.75rem 1rem', borderRadius: '.75rem', fontSize: '.9rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', transition: 'background .15s', fontFamily: 'inherit' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </nav>
        </aside>

        {/* ── CONTENT ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ animation: 'fadeIn .2s ease' }}>
            {activeTab === 'ads'       && <MyAdsTab userId={user?.id} />}
            {activeTab === 'messages'  && <MessagesTab userId={user?.id} />}
            {activeTab === 'favorites' && <FavoritesTab userId={user?.id} />}
            {activeTab === 'profile'   && <ProfileTab user={user} />}
            {activeTab === 'billing'   && <BillingTab user={user} />}
          </div>
        </div>
      </div>

    </>
  )
}
