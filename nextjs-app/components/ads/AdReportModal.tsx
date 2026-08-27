'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useLang } from '@/lib/lang-context';

interface AdReportModalProps {
  adId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Códigos internos estáveis pros motivos de denúncia — desacoplados do texto
// exibido, que agora varia por idioma. O VALOR gravado em reports.reason
// continua sendo exatamente o texto em português de antes (REASON_DB_VALUE),
// pra não quebrar denúncias antigas nem qualquer filtro/relatório que já
// compare esse campo por igualdade de string.
const REPORT_REASON_CODES = [
  'fake_product',
  'misleading_price',
  'inappropriate_content',
  'spam',
  'scam',
  'other',
] as const;
type ReportReasonCode = typeof REPORT_REASON_CODES[number];

const REASON_DB_VALUE: Record<ReportReasonCode, string> = {
  fake_product: 'Produto inexistente ou falso',
  misleading_price: 'Preço enganoso',
  inappropriate_content: 'Conteúdo inapropriado',
  spam: 'Spam ou publicidade enganosa',
  scam: 'Golpe ou fraude',
  other: 'Outro',
};

// Traduções locais deste componente (padrão de components/ads/AdsSidebar.tsx)
// — o modal nunca importava useLang, então título, motivos, erros e botões
// ficavam sempre em português independente do idioma selecionado.
const TRANSLATIONS = {
  pt: {
    title: 'Denunciar Anúncio',
    reasons: REASON_DB_VALUE,
    close: 'Fechar',
    sentTitle: 'Denúncia enviada!',
    sentBody: 'Nossa equipe irá analisar em breve.',
    rateLimited: 'Muitas denúncias em pouco tempo. Aguarde um momento.',
    genericError: 'Erro ao enviar denúncia. Tente novamente.',
    cancel: 'Cancelar',
    send: 'Enviar Denúncia',
    sending: 'Enviando...',
  },
  es: {
    title: 'Denunciar Anuncio',
    reasons: {
      fake_product: 'Producto inexistente o falso',
      misleading_price: 'Precio engañoso',
      inappropriate_content: 'Contenido inapropiado',
      spam: 'Spam o publicidad engañosa',
      scam: 'Estafa o fraude',
      other: 'Otro',
    } satisfies Record<ReportReasonCode, string>,
    close: 'Cerrar',
    sentTitle: '¡Denuncia enviada!',
    sentBody: 'Nuestro equipo la revisará pronto.',
    rateLimited: 'Demasiadas denuncias en poco tiempo. Espera un momento.',
    genericError: 'Error al enviar la denuncia. Inténtalo de nuevo.',
    cancel: 'Cancelar',
    send: 'Enviar Denuncia',
    sending: 'Enviando...',
  },
} as const;

export function AdReportModal({ adId, isOpen, onClose }: AdReportModalProps) {
  const { lang } = useLang();
  const tr = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [reportReason, setReportReason] = useState<ReportReasonCode | ''>('');
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

    // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): zero rate
    // limit aqui — um usuário (ou visitante anônimo) podia disparar
    // denúncias falsas em loop contra o mesmo anúncio. check_rate_limit é
    // o mesmo RPC (janela no Postgres) que /login já usa, liberado pra
    // anon/authenticated de propósito. Sem sessão (denúncia anônima, ainda
    // permitida por design), não tem como saber quem é de verdade —
    // limita por anúncio em vez de por usuário, pra pelo menos travar
    // flood contra um alvo só.
    const bucket = session?.user?.id ? `report_user_${session.user.id}` : `report_ad_${adId}`
    const { data: dentroDoLimite } = await sb.rpc('check_rate_limit', { p_bucket: bucket, p_limit: 5, p_window_seconds: 60 })
    if (dentroDoLimite === false) {
      setErrorMsg(tr.rateLimited);
      setIsSending(false);
      return;
    }

    const { error } = await sb.from('reports').insert({
      ad_id: adId,
      reporter_id: session?.user?.id ?? null,
      // Valor gravado continua o código estável em PT (REASON_DB_VALUE),
      // independente do idioma em que o motivo foi exibido/selecionado.
      reason: REASON_DB_VALUE[reportReason],
      severity: 'low',
    });

    if (error) {
      setErrorMsg(tr.genericError);
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
          aria-label={tr.close}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)' }}
        >
          <X className="w-6 h-6" />
        </button>

        {reportSent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{tr.sentTitle}</h3>
            <p style={{ color: 'var(--clr-text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>{tr.sentBody}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleClose}>
              {tr.close}
            </button>
          </div>
        ) : (
          <>
            <h3
              id="report-modal-title"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}
            >
              <AlertTriangle className="w-6 h-6 text-amber-500" /> {tr.title}
            </h3>

            <div className="report-reasons" style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {REPORT_REASON_CODES.map(code => (
                <button
                  key={code}
                  className={`report-reason-btn ${reportReason === code ? 'selected' : ''}`}
                  onClick={() => setReportReason(code)}
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    borderRadius: '0.5rem',
                    border: `1px solid ${reportReason === code ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                    background: reportReason === code ? 'var(--clr-primary-light, #f0fdf4)' : 'transparent',
                    color: 'var(--clr-text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {tr.reasons[code]}
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
                {tr.cancel}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '0.8rem', borderRadius: '0.8rem', opacity: (!reportReason || isSending) ? 0.6 : 1 }}
                onClick={sendReport}
                disabled={!reportReason || isSending}
              >
                {isSending ? tr.sending : tr.send}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
