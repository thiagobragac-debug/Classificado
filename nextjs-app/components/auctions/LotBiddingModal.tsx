'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NumericFormat } from 'react-number-format';
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
  // BUG CORRIGIDO (3ª varredura): winner_id já existe em auction_lots
  // (populado por place_lot_bid_atomic) mas nunca era buscado/exibido no
  // lado público — só o admin mostrava quem estava vencendo.
  winner_id?: string | null;
}

interface LotBiddingModalProps {
  lot: LotData | null;
  onClose: () => void;
  userId?: string; // from session
  isLive?: boolean;
  isCancelled?: boolean;
  // BUG CORRIGIDO (3ª varredura): auction_events.step nunca era buscado nem
  // usado na UI — os "lances rápidos" eram 4 valores fixos calculados só a
  // partir do currentBid, sem nenhuma relação com o incremento mínimo real
  // exigido pelo servidor (place_lot_bid_atomic: lance >= currentBid + step).
  // Com min_bid=100/step=500, por exemplo, 2 dos 4 botões antigos (200 e 300)
  // ficavam abaixo do mínimo real (600) e eram sempre rejeitados pelo RPC.
  step?: number;
}

/**
 * Retorna os valores de "lance rápido" (deltas somados ao lance atual).
 * O servidor (place_lot_bid_atomic) exige lance >= currentBid + step — por
 * isso, quando o evento tem step configurado, o primeiro tier É esse
 * mínimo real e os demais são múltiplos dele, garantindo que todo botão
 * gerado seja sempre aceito pelo RPC.
 */
function getBidIncrements(currentBid: number, step: number): number[] {
  if (step > 0) {
    return [step, step * 2, step * 5, step * 10];
  }
  // Sem step configurado no evento (o RPC trata como 0 nesse caso) —
  // qualquer valor acima do lance atual é válido, mantém os tiers antigos.
  if (currentBid < 1_000)  return [100, 200, 500, 1_000];
  if (currentBid < 10_000) return [500, 1_000, 2_000, 5_000];
  if (currentBid < 50_000) return [1_000, 2_500, 5_000, 10_000];
  return [5_000, 10_000, 25_000, 50_000];
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LotBiddingModal({ lot, onClose, userId, isLive = true, isCancelled = false, step = 0 }: LotBiddingModalProps) {
  const router = useRouter();
  const [bidding, setBidding] = useState(false);
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [manualBid, setManualBid] = useState<number | undefined>(undefined);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = 'lot-modal-title';

  const currentBid = lot ? (lot.current_bid || lot.min_bid || 0) : 0;
  // Mesmo cálculo do RPC (v_min_valid): coalesce(current_bid, min_bid, 0) + coalesce(step, 0).
  const minValidBid = currentBid + (step > 0 ? step : 0);
  const isWinning = !!(userId && lot?.winner_id && lot.winner_id === userId);

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
    // BUG CORRIGIDO (reteste do site, 2026-08-25): num evento AGENDADO
    // (isLive=false), o modal deixava o usuário escolher valor e chegar
    // até "Confirmar lance de R$X?" antes de descobrir, só depois de
    // clicar Confirmar, que o servidor rejeita ("Este leilão não está ao
    // vivo"). O RPC continua sendo a validação real — isto é só aviso
    // antecipado na UI, pra não fingir que o fluxo vai completar.
    if (isCancelled) {
      showToast('Este leilão foi cancelado — não é possível dar lances.', 'error');
      return;
    }
    if (!isLive) {
      showToast('Este leilão ainda não está ao vivo — lances abrem quando a transmissão iniciar.', 'warning');
      return;
    }
    if (!userId) {
      showToast('Você precisa estar logado para dar lances.', 'error');
      return;
    }
    // BUG CORRIGIDO (3ª varredura): comparava só com currentBid, ignorando o
    // step do evento — permitia abrir a confirmação para um valor que o
    // servidor rejeitaria (lance >= currentBid + step). Agora usa o mesmo
    // mínimo (minValidBid) que o RPC calcula, tanto para os botões rápidos
    // (que já nascem válidos) quanto para o campo de valor manual.
    if (amount < minValidBid) {
      showToast(`O lance deve ser de pelo menos ${BRL.format(minValidBid)}.`, 'warning');
      return;
    }
    setPendingBid(amount);
  }, [userId, minValidBid, isLive, isCancelled]);

  // BUG CORRIGIDO (3ª varredura): não existia nenhum campo de valor manual —
  // só os 4 botões de lance rápido. Um lote com step alto relativo ao
  // min_bid podia ficar sem NENHUMA forma válida de dar lance pela UI antes
  // desta correção (os tiers antigos ignoravam o step por completo).
  const requestManualBid = useCallback(() => {
    if (manualBid === undefined || !isFinite(manualBid) || manualBid <= 0) {
      showToast('Informe um valor de lance.', 'warning');
      return;
    }
    requestBid(manualBid);
  }, [manualBid, requestBid]);

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
      setManualBid(undefined);
      onClose();
      // BUG CORRIGIDO (reteste do site, 2026-08-25): o card do lote na
      // página (Server Component) continuava com o "Lance Atual" antigo
      // até um F5 manual — lots vem do servidor, não há refetch automático
      // depois de um lance bem-sucedido.
      router.refresh();
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

  const increments = getBidIncrements(currentBid, step);

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>LANCE ATUAL</div>
                {/* BUG CORRIGIDO (3ª varredura): winner_id nunca era comparado
                    com o usuário logado na UI pública — nenhum indicador de
                    "você está vencendo". */}
                {isWinning && (
                  <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '20px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700 }}>
                    Você está vencendo!
                  </span>
                )}
              </div>
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
              ) : isCancelled ? (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '1rem', color: '#f87171', fontSize: '0.9rem' }}>
                  Este leilão foi cancelado. Não é possível dar lances.
                </div>
              ) : !isLive ? (
                <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', padding: '1rem', color: '#fbbf24', fontSize: '0.9rem' }}>
                  Este leilão ainda não está ao vivo. Lances abrem quando a transmissão iniciar.
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

                  {/* BUG CORRIGIDO (3ª varredura): não havia campo de valor
                      manual — a única forma de dar lance eram os 4 botões
                      rápidos. Mantido sempre disponível como alternativa,
                      com o mínimo real (currentBid + step) validado aqui
                      antes de enviar (o servidor valida de novo de qualquer
                      forma). */}
                  <h4 style={{ margin: '1.25rem 0 0.5rem', color: 'white', fontSize: '1rem' }}>Ou dê um lance manual</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <NumericFormat
                      value={manualBid ?? ''}
                      onValueChange={(values) => setManualBid(values.floatValue)}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      allowNegative={false}
                      placeholder={`Mínimo: ${BRL.format(minValidBid)}`}
                      aria-label="Valor do lance manual"
                      disabled={bidding}
                      style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '0.9rem' }}
                    />
                    <button
                      onClick={requestManualBid}
                      disabled={bidding}
                      className="btn btn--accent"
                      style={{ padding: '0.75rem 1rem', justifyContent: 'center', whiteSpace: 'nowrap' }}
                    >
                      Dar Lance
                    </button>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    Lance mínimo válido: {BRL.format(minValidBid)}
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
