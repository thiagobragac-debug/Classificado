'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

interface AdReportModalProps {
  adId: string;
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Produto inexistente ou falso',
  'Preço enganoso',
  'Conteúdo inapropriado',
  'Spam ou publicidade enganosa',
  'Golpe ou fraude',
  'Outro'
];

export function AdReportModal({ adId, isOpen, onClose }: AdReportModalProps) {
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sendReport = async () => {
    if (!reportReason || !adId) return;
    setIsSending(true);
    setErrorMsg('');

    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();

    const { error } = await sb.from('reports').insert({
      ad_id: adId,
      reporter_id: session?.user?.id ?? null,
      reason: reportReason,
      severity: 'low',
    });

    if (error) {
      setErrorMsg('Erro ao enviar denúncia. Tente novamente.');
      setIsSending(false);
      return;
    }

    setReportSent(true);
    setIsSending(false);
  };

  const handleClose = () => {
    setReportSent(false);
    setReportReason('');
    setErrorMsg('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="report-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
    >
      <div
        className="report-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        style={{
          background: 'var(--clr-surface)',
          padding: '2rem',
          borderRadius: '1rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative'
        }}
      >
        <button
          onClick={handleClose}
          aria-label="Fechar"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)' }}
        >
          <X className="w-6 h-6" />
        </button>

        {reportSent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Denúncia enviada!</h3>
            <p style={{ color: 'var(--clr-text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>Nossa equipe irá analisar em breve.</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleClose}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <h3
              id="report-modal-title"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}
            >
              <AlertTriangle className="w-6 h-6 text-amber-500" /> Denunciar Anúncio
            </h3>

            <div className="report-reasons" style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {REPORT_REASONS.map(reason => (
                <button
                  key={reason}
                  className={`report-reason-btn ${reportReason === reason ? 'selected' : ''}`}
                  onClick={() => setReportReason(reason)}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    borderRadius: '0.5rem',
                    border: `1px solid ${reportReason === reason ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                    background: reportReason === reason ? 'var(--clr-primary-light, #f0fdf4)' : 'transparent',
                    color: 'var(--clr-text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>

            {errorMsg && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', background: '#fef2f2', color: '#991b1b' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                className="btn btn-outline"
                style={{ flex: 1, padding: '0.8rem', borderRadius: '0.8rem' }}
                onClick={handleClose}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '0.8rem', borderRadius: '0.8rem', opacity: (!reportReason || isSending) ? 0.6 : 1 }}
                onClick={sendReport}
                disabled={!reportReason || isSending}
              >
                {isSending ? 'Enviando...' : 'Enviar Denúncia'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
