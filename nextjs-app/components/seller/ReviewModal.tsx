'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ReviewModal({ sellerId, onClose }: { sellerId: string; onClose: () => void }) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const submitReview = async () => {
    if (selectedRating === 0) {
      alert("Selecione pelo menos 1 estrela.");
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const sb = getSupabase();
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error("Você precisa estar logado para avaliar.");

      const { data: prof } = await sb.from('profiles').select('name').eq('id', user.id).single();
      const reviewerName = prof?.name || 'Usuário Verificado';

      const { error } = await sb.from('seller_reviews').insert({
        seller_id: sellerId,
        reviewer_id: user.id,
        reviewer_name: reviewerName,
        rating: selectedRating,
        comment: comment.trim()
      });

      if (error) {
        if (error.message.includes('duplicate')) throw new Error("Você já avaliou este vendedor.");
        throw error;
      }
      
      alert("Avaliação enviada com sucesso! Obrigado.");
      onClose();
      router.refresh();

    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao enviar avaliação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#fff', width: '90%', maxWidth: '450px', borderRadius: '1rem', padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--clr-text-light)' }}>&times;</button>
        <h3 style={{ marginTop: 0, color: 'var(--clr-text)', fontSize: '1.5rem' }}>Avaliar Vendedor</h3>
        <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.5rem' }}>Sua avaliação ajuda a construir um ambiente seguro para todos.</p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5].map((val) => (
            <span
              key={val}
              onClick={() => setSelectedRating(val)}
              style={{
                fontSize: '2.5rem',
                cursor: 'pointer',
                transition: 'color 0.2s',
                color: val <= selectedRating ? '#f59e0b' : '#e2e8f0'
              }}
            >
              ★
            </span>
          ))}
        </div>
        
        <textarea 
          placeholder="Deixe um comentário curto (opcional)" 
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={{ width: '100%', border: '2px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit', marginBottom: '1rem' }}
        />
        
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
