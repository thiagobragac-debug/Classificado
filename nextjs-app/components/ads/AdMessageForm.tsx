'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

interface AdMessageFormProps {
  adId: string;
  receiverId: string | null;
}

export function AdMessageForm({ adId, receiverId }: AdMessageFormProps) {
  const [msgText, setMsgText] = useState('');
  const [msgStatus, setMsgStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [msgSending, setMsgSending] = useState(false);

  const sendMessage = async () => {
    if (!msgText.trim() || !receiverId) return;
    
    setMsgSending(true);
    setMsgStatus(null);
    
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    
    if (!session) {
      setMsgStatus({ type: 'error', text: 'Você precisa estar logado para enviar mensagens.' });
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
      setMsgStatus({ type: 'error', text: 'Erro ao enviar. Tente novamente.' });
    } else {
      setMsgStatus({ type: 'success', text: '✓ Mensagem enviada com sucesso!' });
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
        placeholder="Olá! Tenho interesse neste anúncio e gostaria de mais informações..."
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
        {msgSending ? 'Enviando…' : 'Enviar Mensagem'}
      </button>
    </div>
  );
}
