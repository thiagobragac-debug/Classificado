'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { showToast } from '@/lib/toast';
import { useLang } from '@/lib/lang-context';

const TRANSLATIONS = {
  pt: {
    selectStar: 'Selecione pelo menos 1 estrela.',
    maxComment: 'O comentário deve ter no máximo 500 caracteres.',
    mustBeLoggedIn: 'Você precisa estar logado para avaliar.',
    alreadyReviewed: 'Você já avaliou este vendedor.',
    cannotReviewSelf: 'Você não pode avaliar a si mesmo.',
    genericError: 'Erro ao enviar avaliação',
    reviewSent: 'Avaliação enviada com sucesso! Obrigado.',
    closeModal: 'Fechar modal de avaliação',
    title: 'Avaliar Vendedor',
    subtitle: 'Sua avaliação ajuda a construir um ambiente seguro para todos.',
    selectRating: 'Selecione uma avaliação',
    starLabel: (val: number) => `${val} estrela${val > 1 ? 's' : ''}`,
    commentPlaceholder: 'Deixe um comentário curto (opcional)',
    sending: 'Enviando...',
    sendReview: 'Enviar Avaliação',
  },
  es: {
    selectStar: 'Selecciona al menos 1 estrella.',
    maxComment: 'El comentario debe tener como máximo 500 caracteres.',
    mustBeLoggedIn: 'Debes iniciar sesión para valorar.',
    alreadyReviewed: 'Ya valoraste a este vendedor.',
    cannotReviewSelf: 'No puedes valorarte a ti mismo.',
    genericError: 'Error al enviar la valoración',
    reviewSent: '¡Valoración enviada con éxito! Gracias.',
    closeModal: 'Cerrar modal de valoración',
    title: 'Valorar Vendedor',
    subtitle: 'Tu valoración ayuda a construir un ambiente seguro para todos.',
    selectRating: 'Selecciona una valoración',
    starLabel: (val: number) => `${val} estrella${val > 1 ? 's' : ''}`,
    commentPlaceholder: 'Deja un comentario corto (opcional)',
    sending: 'Enviando...',
    sendReview: 'Enviar Valoración',
  },
};

export default function ReviewModal({ sellerId, onClose }: { sellerId: string; onClose: () => void }) {
  const { lang } = useLang();
  const tr = TRANSLATIONS[lang];
  const [selectedRating, setSelectedRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isSubmitting = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Focus trap
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [onClose]);

  const submitReview = async () => {
    if (isSubmitting.current) return;
    if (selectedRating === 0) {
      showToast(tr.selectStar, 'warning');
      return;
    }
    if (comment.trim().length > 500) {
      showToast(tr.maxComment, 'warning');
      return;
    }

    isSubmitting.current = true;
    setLoading(true);
    setErrorMsg('');

    try {
      const sb = getSupabase();
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error(tr.mustBeLoggedIn);

      const { error } = await sb.from('seller_reviews').insert({
        seller_id: sellerId,
        reviewer_id: user.id,
        rating: selectedRating,
        comment: comment.trim()
      });

      if (error) {
        // 23505 = unique_violation (par seller_id/reviewer_id repetido).
        // seller_reviews_nao_autoavaliar = CHECK que impede autoavaliação.
        // Ambos em supabase/migrations/20260823090000_guard_seller_reviews.sql
        if (error.message.includes('duplicate')) throw new Error(tr.alreadyReviewed);
        if (error.message.includes('seller_reviews_nao_autoavaliar')) throw new Error(tr.cannotReviewSelf);
        throw error;
      }

      showToast(tr.reviewSent, 'success');
      onClose();
      router.refresh();

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr.genericError;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        style={{ background: '#fff', width: '90%', maxWidth: '450px', borderRadius: '1rem', padding: '2rem', position: 'relative' }}
      >
        <button
          onClick={onClose}
          aria-label={tr.closeModal}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--clr-text-light)' }}
        >
          &times;
        </button>
        <h3 id="review-modal-title" style={{ marginTop: 0, color: 'var(--clr-text)', fontSize: '1.5rem' }}>{tr.title}</h3>
        <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{tr.subtitle}</p>

        <div role="radiogroup" aria-label={tr.selectRating} style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              role="radio"
              aria-checked={val === selectedRating}
              aria-label={tr.starLabel(val)}
              onClick={() => setSelectedRating(val)}
              style={{
                fontSize: '2.5rem',
                cursor: 'pointer',
                transition: 'color 0.2s',
                color: val <= selectedRating ? '#f59e0b' : '#e2e8f0',
                background: 'none',
                border: 'none',
                padding: '0.25rem',
                lineHeight: 1
              }}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          placeholder={tr.commentPlaceholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          style={{ width: '100%', border: '2px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit', marginBottom: '0.25rem' }}
        />
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'right', marginBottom: '1rem' }}>
          {comment.length}/500
        </p>

        {errorMsg && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', background: '#fef2f2', color: '#991b1b' }}>
            {errorMsg}
          </div>
        )}

        <button
          onClick={submitReview}
          disabled={loading}
          style={{ width: '100%', background: '#16a34a', border: 'none', color: 'white', fontSize: '1.1rem', fontWeight: 800, padding: '1rem', borderRadius: '.75rem', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(22,163,74,0.4)', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? tr.sending : tr.sendReview}
        </button>
      </div>
    </div>
  );
}
