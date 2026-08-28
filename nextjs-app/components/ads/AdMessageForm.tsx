'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';

// Traduções locais deste componente (padrão de components/ads/AdsSidebar.tsx)
// — o formulário nunca importava useLang, então placeholder, erros e o toast
// de sucesso ficavam sempre em português independente do idioma selecionado.
const TRANSLATIONS = {
  pt: {
    placeholder: 'Olá! Tenho interesse neste anúncio e gostaria de mais informações...',
    needLogin: 'Você precisa estar logado para enviar mensagens.',
    rateLimited: 'Muitas mensagens em pouco tempo. Aguarde um momento.',
    genericError: 'Erro ao enviar. Tente novamente.',
    success: '✓ Mensagem enviada com sucesso!',
    sending: 'Enviando…',
    send: 'Enviar Mensagem',
  },
  es: {
    placeholder: '¡Hola! Estoy interesado en este anuncio y me gustaría más información...',
    needLogin: 'Debes iniciar sesión para enviar mensajes.',
    rateLimited: 'Demasiados mensajes en poco tiempo. Espera un momento.',
    genericError: 'Error al enviar. Inténtalo de nuevo.',
    success: '✓ ¡Mensaje enviado con éxito!',
    sending: 'Enviando…',
    send: 'Enviar Mensaje',
  },
} as const;

interface AdMessageFormProps {
  adId: string;
  receiverId: string | null;
}

export function AdMessageForm({ adId, receiverId }: AdMessageFormProps) {
  const { lang } = useLang();
  const tr = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [msgText, setMsgText] = useState('');
  const [msgStatus, setMsgStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [msgSending, setMsgSending] = useState(false);

  const sendMessage = async () => {
    if (!msgText.trim()) return;
    // BUG CORRIGIDO (varredura cruzada de cenários): sem receiverId
    // (ad.user_id nulo), o clique em "Enviar Mensagem" falhava em silêncio
    // — nenhum status de erro era mostrado, o usuário não tinha como saber
    // por que nada aconteceu.
    if (!receiverId) {
      setMsgStatus({ type: 'error', text: tr.genericError });
      return;
    }

    setMsgSending(true);
    setMsgStatus(null);

    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
      setMsgStatus({ type: 'error', text: tr.needLogin });
      setMsgSending(false);
      return;
    }

    // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): insert
    // direto sem nenhum limite de taxa — mesmo padrão já usado em
    // check_rate_limit (janela no Postgres, liberado pra authenticated).
    const { data: dentroDoLimite } = await sb.rpc('check_rate_limit', { p_bucket: `message_user_${session.user.id}`, p_limit: 10, p_window_seconds: 60 })
    if (dentroDoLimite === false) {
      setMsgStatus({ type: 'error', text: tr.rateLimited });
      setMsgSending(false);
      return;
    }

    const { error } = await sb.from('messages').insert({
      ad_id: adId,
      sender_id: session.user.id,
      receiver_id: receiverId,
      content: msgText.trim(),
    });

    if (error) {
      setMsgStatus({ type: 'error', text: tr.genericError });
    } else {
      setMsgStatus({ type: 'success', text: tr.success });
      setMsgText('');
    }

    setMsgSending(false);
  };

  return (
    <div className="msg-body" style={{ marginTop: '1rem', background: 'var(--clr-surface-alt)', padding: '1rem', borderRadius: '0.8rem' }}>
      {msgStatus && (
        <div 
          className={`msg-alert ${msgStatus.type}`}
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            background: msgStatus.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: msgStatus.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${msgStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`
          }}
        >
          {msgStatus.text}
        </div>
      )}
      <textarea
        className="msg-textarea"
        placeholder={tr.placeholder}
        value={msgText}
        onChange={e => setMsgText(e.target.value)}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--clr-border)',
          resize: 'vertical',
          marginBottom: '1rem',
          fontFamily: 'inherit'
        }}
      />
      <button
        className="btn btn-primary"
        onClick={sendMessage}
        disabled={msgSending || !msgText.trim()}
        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', opacity: (msgSending || !msgText.trim()) ? 0.7 : 1 }}
      >
        {msgSending ? tr.sending : tr.send}
      </button>
    </div>
  );
}
