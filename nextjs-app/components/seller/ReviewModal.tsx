'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { showToast } from '@/lib/toast';

export default function ReviewModal({ sellerId, onClose }: { sellerId: string; onClose: () => void }) {
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
      showToast('Selecione pelo menos 1 estrela.', 'warning');
      return;
    }
    if (comment.trim().length > 500) {
      showToast('O comentário deve ter no máximo 500 caracteres.', 'warning');
      return;
    }

    isSubmitting.current = true;
    setLoading(true);
    setErrorMsg('');

    try {
      const sb = getSupabase();
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error('Você precisa estar logado para avaliar.');

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
        if (error.message.includes('duplicate')) throw new Error('Você já avaliou este vendedor.');
        if (error.message.includes('seller_reviews_nao_autoavaliar')) throw new Error('Você não pode avaliar a si mesmo.');
        throw error;
      }

      showToast('Avaliação enviada com sucesso! Obrigado.', 'success');
      onClose();
      router.refresh();

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar avaliação';
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
          aria-label="Fechar modal de avaliação"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--clr-text-light)' }}
        >
          &times;
        </button>
        <h3 id="review-modal-title" style={{ marginTop: 0, color: 'var(--clr-text)', fontSize: '1.5rem' }}>Avaliar Vendedor</h3>
        <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.5rem' }}>Sua avaliação ajuda a construir um ambiente seguro para todos.</p>

        <div role="radiogroup" aria-label="Selecione uma avaliação" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              role="radio"
              aria-checked={val === selectedRating}
              aria-label={`${val} estrela${val > 1 ? 's' : ''}`}
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
          placeholder="Deixe um comentário curto (opcional)"
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
          {loading ? 'Enviando...' : 'Enviar Avaliação'}
        </button>
      </div>
    </div>
  );
}
