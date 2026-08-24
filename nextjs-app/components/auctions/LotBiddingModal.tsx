'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { placeLotBid } from '@/lib/supabase';
import { showToast } from '@/lib/toast';

export interface LotData {
  id: string;
  auction_id: string;
  lot_number: string;
  title: string;
  min_bid: number;
  image: string | null;
  video: string | null;
  sire: string | null;
  dam: string | null;
  description: string | null;
  // Computed fields (if we have bid tracking later)
  current_bid?: number;
}

interface LotBiddingModalProps {
  lot: LotData | null;
  onClose: () => void;
  userId?: string; // from session
}

/** Returns dynamic bid increment options based on the current bid value */
function getBidIncrements(currentBid: number): number[] {
  if (currentBid < 1_000)  return [100, 200, 500, 1_000];
  if (currentBid < 10_000) return [500, 1_000, 2_000, 5_000];
  if (currentBid < 50_000) return [1_000, 2_500, 5_000, 10_000];
  return [5_000, 10_000, 25_000, 50_000];
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LotBiddingModal({ lot, onClose, userId }: LotBiddingModalProps) {
  const [bidding, setBidding] = useState(false);
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = 'lot-modal-title';

  const currentBid = lot ? (lot.current_bid || lot.min_bid || 0) : 0;

  // ─── Focus trap ────────────────────────────────────────────────
  useEffect(() => {
    if (!lot) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusableSelectors =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableEls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
      );
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [lot, onClose]);

  // ─── Bid confirmation step ─────────────────────────────────────
  const requestBid = useCallback((amount: number) => {
    if (!userId) {
      showToast('Você precisa estar logado para dar lances.', 'error');
      return;
    }
    if (amount <= currentBid) {
      showToast(`O lance deve ser maior que o lance atual (${BRL.format(currentBid)}).`, 'warning');
      return;
    }
    setPendingBid(amount);
  }, [userId, currentBid]);

  const confirmBid = useCallback(async () => {
    if (pendingBid === null || !userId || !lot) return;
    setBidding(true);
    try {
      // BUG CORRIGIDO: chamava placeBid(lot.auction_id, ...), que envia o id
      // do EVENTO para uma função feita para outro sistema (leilão de
      // anúncio individual) — todo lance falhava com "Leilão não
      // encontrado". Ver lib/supabase.ts:placeLotBid.
      await placeLotBid(lot.id, pendingBid);
      showToast(`Lance de ${BRL.format(pendingBid)} registrado com sucesso!`, 'success');
      setPendingBid(null);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar lance.';
      showToast(msg, 'error');
    } finally {
      setBidding(false);
    }
  }, [pendingBid, userId, lot, onClose]);

  const cancelBid = useCallback(() => setPendingBid(null), []);

  if (!lot) return null;

  const isYoutube = lot.video && (lot.video.includes('youtube.com') || lot.video.includes('youtu.be'));
  const ytMatch = isYoutube ? lot.video?.match(/(?:v=|youtu\.be\/)([^&]+)/) : null;
  const ytId = ytMatch ? ytMatch[1] : null;

  const increments = getBidIncrements(currentBid);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ background: '#0f172a', width: '100%', maxWidth: '900px', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 id={titleId} style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'white' }}>
            LOTE {lot.lot_number} — {lot.title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar modal"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', overflowY: 'auto' }}>
          {/* Media Section */}
          <div style={{ flex: '1 1 500px', background: '#000', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lot.video ? (
              isYoutube && ytId ? (
                <iframe
                  width="100%"
                  height="100%"
                  style={{ minHeight: '400px', border: 'none' }}
                  src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title={`Vídeo do lote ${lot.lot_number}`}
                ></iframe>
              ) : (
                <video src={lot.video} controls autoPlay style={{ width: '100%', maxHeight: '400px' }}></video>
              )
            ) : lot.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lot.image} alt={`Foto do lote ${lot.lot_number}: ${lot.title}`} style={{ width: '100%', maxHeight: '400px', objectFit: 'contain' }} />
            ) : (
              <span style={{ color: '#64748b' }}>Sem mídia</span>
            )}
          </div>

          {/* Details & Bidding Section */}
          <div style={{ flex: '1 1 350px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.25rem' }}>LANCE ATUAL</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#22c55e' }}>
                {BRL.format(currentBid)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}><strong>Pai:</strong> {lot.sire || 'Não informado'}</div>
              <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}><strong>Mãe:</strong> {lot.dam || 'Não informado'}</div>
              {lot.description && (
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.5rem', lineHeight: 1.5 }}>
                  {lot.description}
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {/* Confirmation step */}
              {pendingBid !== null ? (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                  <p style={{ color: 'white', marginBottom: '0.75rem', fontWeight: 600 }}>
                    Confirmar lance de <span style={{ color: '#22c55e' }}>{BRL.format(pendingBid)}</span>?
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={confirmBid}
                      disabled={bidding}
                      className="btn btn--accent"
                      style={{ flex: 1, justifyContent: 'center', background: '#22c55e', color: '#000', border: 'none' }}
                      aria-busy={bidding}
                    >
                      {bidding ? 'Enviando…' : 'Confirmar'}
                    </button>
                    <button
                      onClick={cancelBid}
                      disabled={bidding}
                      className="btn btn--outline"
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h4 style={{ marginBottom: '1rem', color: 'white', fontSize: '1rem' }}>Lances Rápidos</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {increments.map((inc) => {
                      const bidAmount = currentBid + inc;
                      return (
                        <button
                          key={inc}
                          onClick={() => requestBid(bidAmount)}
                          disabled={bidding}
                          className="btn btn--outline"
                          style={{ padding: '0.75rem', fontSize: '0.9rem', background: 'rgba(34,197,94,0.1)', borderColor: '#22c55e', color: '#22c55e' }}
                        >
                          + {BRL.format(inc)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
