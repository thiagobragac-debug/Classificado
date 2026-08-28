'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { imageUrl } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';
import { formatPrice } from '@/lib/currency';
import { LotData } from './LotBiddingModal';
import LotBiddingModal from './LotBiddingModal';

// BUG CORRIGIDO (auditoria de i18n, 2026-08-26/27): componente inteiro
// (estado vazio, "LOTE N", indicador de vencedor, LANCE ATUAL/INICIAL,
// botão "Dar Lance"/"Ver Lote") ficava fixo em português mesmo com ES
// selecionado — nunca importava useLang(). Strings novas que não existem
// no dicionário global (lib/constants.ts) seguem o mesmo padrão local já
// usado em components/ads/AdsSidebar.tsx.
const TRANSLATIONS = {
  pt: {
    empty: 'Nenhum lote cadastrado para este leilão.',
    lot: 'LOTE',
    winning: 'Você está vencendo!',
    currentBid: 'LANCE ATUAL',
    initialBid: 'LANCE INICIAL',
    placeBid: 'Dar Lance',
    viewLot: 'Ver Lote',
    lotPhotoAlt: (num: string, title: string) => `Foto do lote ${num}: ${title}`,
  },
  es: {
    empty: 'Ningún lote registrado para este remate.',
    lot: 'LOTE',
    winning: '¡Estás ganando!',
    currentBid: 'PUJA ACTUAL',
    initialBid: 'PUJA INICIAL',
    placeBid: 'Pujar',
    viewLot: 'Ver Lote',
    lotPhotoAlt: (num: string, title: string) => `Foto del lote ${num}: ${title}`,
  },
} as const;

interface LotGridProps {
  lots: LotData[];
  isLive: boolean;
  isCancelled?: boolean;
  // BUG CORRIGIDO (varredura cruzada de cenários): sem isso, um leilão
  // encerrado (status='closed') caía no mesmo branch !isLive de um leilão
  // AGENDADO no modal de lance, mostrando "ainda não está ao vivo" pra um
  // leilão que já terminou.
  isClosed?: boolean;
  userId?: string;
  // BUG CORRIGIDO (3ª varredura): auction_events.step nunca chegava até o
  // modal de lances — necessário para calcular o mínimo real de lance.
  step?: number;
  // BUG CORRIGIDO (3ª varredura): usado para filtrar a subscription do
  // Supabase Realtime (postgres_changes) só nos lotes deste leilão.
  auctionId?: string;
}

export default function LotGrid({ lots, isLive, isCancelled = false, isClosed = false, userId, step = 0, auctionId }: LotGridProps) {
  const { lang } = useLang();
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [selectedLot, setSelectedLot] = useState<LotData | null>(null);
  // BUG CORRIGIDO (3ª varredura): a página é Server Component (ISR de 30s) —
  // sem estado local aqui, current_bid/winner_id só atualizavam com um F5
  // manual ou com o router.refresh() disparado por quem acabou de dar
  // lance. Um espectador com a aba aberta não via lances de OUTROS
  // usuários (confirmado ao vivo: aba travada no valor antigo enquanto
  // outro lance real avançava em outra sessão).
  const [lotsState, setLotsState] = useState<LotData[]>(lots);

  // Mantém lotsState em sincronia quando o Server Component reenvia props
  // novas (ex.: depois de um router.refresh() do próprio usuário).
  useEffect(() => {
    setLotsState(lots);
  }, [lots]);

  // Supabase Realtime: assina UPDATE em auction_lots filtrado pelo leilão
  // atual e atualiza current_bid/winner_id na tela pra todos os
  // espectadores, sem precisar de F5.
  useEffect(() => {
    if (!auctionId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`auction-lots-${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auction_lots',
          filter: `auction_id=eq.${auctionId}`,
        },
        (payload: { new: { id: string; current_bid: number | null; winner_id: string | null } }) => {
          const updated = payload.new;
          setLotsState(prev =>
            prev.map(l =>
              l.id === updated.id
                ? { ...l, current_bid: updated.current_bid ?? undefined, winner_id: updated.winner_id }
                : l
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId]);

  // Mantém o modal aberto (se houver) em sincronia com atualizações em
  // tempo real do lote que ele está exibindo.
  useEffect(() => {
    setSelectedLot(prev => {
      if (!prev) return prev;
      const fresh = lotsState.find(l => l.id === prev.id);
      if (fresh && (fresh.current_bid !== prev.current_bid || fresh.winner_id !== prev.winner_id)) {
        return fresh;
      }
      return prev;
    });
  }, [lotsState]);

  if (!lotsState || lotsState.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--clr-text-light)' }}>
        {T.empty}
      </div>
    );
  }

  return (
    <>
      <div className="ads-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginTop: '2rem' }}>
        {lotsState.map(lot => {
          const currentBid = lot.current_bid || lot.min_bid || 0;
          const imgFilter = !isLive ? 'grayscale(80%) opacity(0.85)' : 'none';
          // BUG CORRIGIDO (3ª varredura): winner_id nunca era comparado com
          // o usuário logado no lado público — só o admin mostrava vencedor.
          const isWinning = !!(userId && lot.winner_id && lot.winner_id === userId);
          // Coluna nova (auditoria de i18n, 2026-08-26/27) — fallback pra title.
          const lotTitle = lang === 'es' && lot.title_es ? lot.title_es : lot.title;

          return (
            <article key={lot.id} className="ad-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="ad-card__image" style={{ position: 'relative', height: '200px' }}>
                <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#020617', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, zIndex: 10 }}>
                  {T.lot} {lot.lot_number}
                </div>
                {isWinning && (
                  <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#22c55e', color: '#000', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, zIndex: 10 }}>
                    {T.winning}
                  </div>
                )}
                <Image
                  src={imageUrl(lot.image)}
                  alt={T.lotPhotoAlt(lot.lot_number, lotTitle)}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 280px"
                  style={{ objectFit: 'cover', filter: imgFilter }}
                />
              </div>

              <div className="ad-card__body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
                <h3 className="ad-card__title" style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: 1.3 }}>
                  {lotTitle}
                </h3>

                <div style={{ background: 'var(--clr-bg-alt)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-light)', marginBottom: '0.2rem' }}>
                    {/* BUG CORRIGIDO (validação do zero, 3ª rodada): o rótulo
                        dependia só de isLive — um leilão cancelado (ou
                        encerrado) que já tinha recebido lance real mostrava
                        "LANCE INICIAL" sobre um valor que na verdade é o
                        último lance de verdade. Depende de existir lance
                        real, não do status do leilão. */}
                    {lot.current_bid ? T.currentBid : T.initialBid}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#22c55e' }}>
                    {formatPrice(currentBid, 'BRL', lang as 'pt' | 'es')}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button
                    onClick={() => setSelectedLot(lot)}
                    className="btn btn--accent"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {isLive ? T.placeBid : T.viewLot}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedLot && (
        <LotBiddingModal
          lot={selectedLot}
          userId={userId}
          isLive={isLive}
          isCancelled={isCancelled}
          isClosed={isClosed}
          step={step}
          onClose={() => setSelectedLot(null)}
        />
      )}
    </>
  );
}
