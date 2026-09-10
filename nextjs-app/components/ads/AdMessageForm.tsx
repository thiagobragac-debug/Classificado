'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';

// Mesmo padrão de components/seller/ReviewModal.tsx (textarea com
// maxLength + contador "X/limite" visível).
const MAX_MESSAGE_LENGTH = 1000;

// Traduções locais deste componente (padrão de components/ads/AdsSidebar.tsx)
// — o formulário nunca importava useLang, então placeholder, erros e o toast
// de sucesso ficavam sempre em português independente do idioma selecionado.
const TRANSLATIONS = {
  pt: {
    placeholder: 'Olá! Tenho interesse neste anúncio e gostaria de mais informações...',
    needLogin: 'Você precisa estar logado para enviar mensagens.',
    loginCta: 'Fazer login',
    rateLimited: 'Muitas mensagens em pouco tempo. Aguarde um momento.',
    genericError: 'Erro ao enviar. Tente novamente.',
    success: '✓ Mensagem enviada com sucesso!',
    sending: 'Enviando…',
    send: 'Enviar Mensagem',
  },
  es: {
    placeholder: '¡Hola! Estoy interesado en este anuncio y me gustaría más información...',
    needLogin: 'Debes iniciar sesión para enviar mensajes.',
    loginCta: 'Iniciar sesión',
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
  // BUG CORRIGIDO (varredura de usabilidade): a sessão só era checada dentro
  // de sendMessage(), no clique de enviar — um visitante deslogado digitava
  // a mensagem inteira só pra descobrir, ao clicar, que precisava logar (e
  // perdia o texto). Agora checa ao montar e mostra um estado dedicado no
  // lugar do textarea pra quem não está logado.
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (active) setIsLoggedIn(!!session);
    })();
    return () => { active = false; };
  }, []);

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

    // BUG CORRIGIDO (achado do teste ao vivo do app Android, 2026-09-10):
    // este componente inseria direto em `messages` do navegador, com um
    // guard de rate limit (RPC check_rate_limit) que nunca funcionava — a
    // migration 20260830200000 revogou o EXECUTE dessa função de
    // anon/authenticated (fechando OUTRA brecha, chamada forjada via
    // PostgREST), então a chamada sempre retornava 42501 e, como `error` não
    // era checado, o guard nunca bloqueava nada. Movido pra uma rota
    // server-side (app/api/messages/send/route.ts) que reaproveita
    // dentroDoLimiteFallback (lib/rate-limit-fallback.ts, service_role, já
    // usada em contact-seller/checkout) pra aplicar de verdade o limite de
    // 10 msgs/60s que a intenção original tinha. O trigger de banco
    // enforce_message_rate_limit (20 msgs/hora) continua existindo por trás
    // como segunda camada, independente desta rota.
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId, content: msgText.trim() }),
    });

    if (!res.ok) {
      const isRateLimited = res.status === 429;
      setMsgStatus({ type: 'error', text: isRateLimited ? tr.rateLimited : tr.genericError });
    } else {
      setMsgStatus({ type: 'success', text: tr.success });
      setMsgText('');
    }

    setMsgSending(false);
  };

  // id usado pelo CTA fixo mobile (app/(public)/anuncio/[id]/page.tsx) pra
  // dar scroll + foco até aqui quando o vendedor não tem WhatsApp cadastrado.
  if (isLoggedIn === false) {
    return (
      <div id="ad-message-form" className="msg-body" style={{ marginTop: '1rem', background: 'var(--clr-surface-alt)', padding: '1rem', borderRadius: '0.8rem' }}>
        <p style={{ margin: 0, marginBottom: '0.75rem', color: 'var(--clr-text-muted)', fontSize: '0.9rem' }}>{tr.needLogin}</p>
        <Link
          href="/login"
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'center', textDecoration: 'none' }}
        >
          {tr.loginCta}
        </Link>
      </div>
    );
  }

  return (
    <div id="ad-message-form" className="msg-body" style={{ marginTop: '1rem', background: 'var(--clr-surface-alt)', padding: '1rem', borderRadius: '0.8rem' }}>
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
        maxLength={MAX_MESSAGE_LENGTH}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--clr-border)',
          resize: 'vertical',
          marginBottom: '0.25rem',
          fontFamily: 'inherit'
        }}
      />
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-text-muted)', textAlign: 'right', marginTop: 0, marginBottom: '1rem' }}>
        {msgText.length}/{MAX_MESSAGE_LENGTH}
      </p>
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
