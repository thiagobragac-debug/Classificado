'use client';

import React, { useState } from 'react';
import { useLang } from '@/lib/lang-context';

// Substitui o <form> fake que vinha embutido no conteúdo de
// institutional_pages (page=contato): tinha um onsubmit puramente cosmético
// (só trocava o texto do botão por "✅ Mensagem enviada!" via setTimeout,
// sem nenhum fetch/envio real) e, por não estar na allowlist do DOMPurify
// (form/input/select/label/button), sequer renderizava direito — sobravam
// labels soltos e texto de <option> vazando sem estrutura na página ao
// vivo. Reaproveita as classes cf-* já existentes em institucional.css
// pra manter a aparência idêntica à do conteúdo antigo.
const TRANSLATIONS = {
  pt: {
    heading: 'Envie sua Mensagem',
    nameLabel: 'Nome completo *',
    namePh: 'Seu nome',
    emailLabel: 'E-mail *',
    emailPh: 'seu@email.com',
    phoneLabel: 'Telefone / WhatsApp',
    phonePh: '(00) 00000-0000',
    subjectLabel: 'Assunto *',
    subjectPlaceholder: 'Selecione...',
    subjects: [
      'Dúvida sobre anúncio',
      'Problemas com conta',
      'Reportar fraude ou golpe',
      'Parceria comercial',
      'Privacidade / LGPD',
      'Imprensa',
      'Outro',
    ],
    messageLabel: 'Mensagem *',
    messagePh: 'Descreva sua solicitação com o máximo de detalhes possível...',
    submit: 'Enviar Mensagem',
    sending: 'Enviando…',
    success: '✅ Mensagem enviada! Vamos responder o quanto antes.',
    errorGeneric: 'Erro ao enviar. Tente novamente em instantes.',
    errorRateLimit: 'Muitas mensagens em pouco tempo. Aguarde alguns minutos.',
    noteLabel: 'Importante:',
    note: 'Este formulário é para atendimento geral. Em casos de fraude ou crime, registre imediatamente um Boletim de Ocorrência junto às autoridades competentes, independentemente do contato conosco.',
  },
  es: {
    heading: 'Envía tu Mensaje',
    nameLabel: 'Nombre completo *',
    namePh: 'Tu nombre',
    emailLabel: 'Correo electrónico *',
    emailPh: 'tu@email.com',
    phoneLabel: 'Teléfono / WhatsApp',
    phonePh: '(00) 00000-0000',
    subjectLabel: 'Asunto *',
    subjectPlaceholder: 'Seleccioná...',
    subjects: [
      'Duda sobre un anuncio',
      'Problemas con la cuenta',
      'Reportar fraude o estafa',
      'Alianza comercial',
      'Privacidad / LGPD',
      'Prensa',
      'Otro',
    ],
    messageLabel: 'Mensaje *',
    messagePh: 'Describí tu solicitud con el mayor detalle posible...',
    submit: 'Enviar Mensaje',
    sending: 'Enviando…',
    success: '✅ ¡Mensaje enviado! Vamos a responder lo antes posible.',
    errorGeneric: 'Error al enviar. Intentá de nuevo en unos instantes.',
    errorRateLimit: 'Demasiados mensajes en poco tiempo. Esperá unos minutos.',
    noteLabel: 'Importante:',
    note: 'Este formulario es para atención general. En casos de fraude o delito, registrá de inmediato una denuncia policial ante las autoridades competentes, independientemente del contacto con nosotros.',
  },
} as const;

export function ContactForm() {
  const { lang } = useLang();
  const tr = TRANSLATIONS[lang];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, subject, message, lang }),
      });
      if (res.ok) {
        setStatus('success');
        setName('');
        setEmail('');
        setPhone('');
        setSubject('');
        setMessage('');
      } else if (res.status === 429) {
        setStatus('error');
        setErrorMsg(tr.errorRateLimit);
      } else {
        setStatus('error');
        setErrorMsg(tr.errorGeneric);
      }
    } catch {
      setStatus('error');
      setErrorMsg(tr.errorGeneric);
    }
  };

  return (
    <div className="contact-form-box">
      <h2>{tr.heading}</h2>
      {status === 'success' ? (
        <p style={{ fontWeight: 700, color: 'var(--clr-primary, #16a34a)' }}>{tr.success}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="cf-row">
            <div className="cf-field">
              <label htmlFor="cf-nome">{tr.nameLabel}</label>
              <input id="cf-nome" type="text" placeholder={tr.namePh} required value={name} onChange={e => setName(e.target.value)} maxLength={200} />
            </div>
            <div className="cf-field">
              <label htmlFor="cf-email">{tr.emailLabel}</label>
              <input id="cf-email" type="email" placeholder={tr.emailPh} required value={email} onChange={e => setEmail(e.target.value)} maxLength={200} />
            </div>
          </div>
          <div className="cf-row">
            <div className="cf-field">
              <label htmlFor="cf-tel">{tr.phoneLabel}</label>
              <input id="cf-tel" type="tel" placeholder={tr.phonePh} value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} />
            </div>
            <div className="cf-field">
              <label htmlFor="cf-assunto">{tr.subjectLabel}</label>
              <select id="cf-assunto" required value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">{tr.subjectPlaceholder}</option>
                {tr.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="cf-row">
            <div className="cf-field cf-full">
              <label htmlFor="cf-msg">{tr.messageLabel}</label>
              <textarea id="cf-msg" rows={5} placeholder={tr.messagePh} required style={{ resize: 'vertical' }} value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} />
            </div>
          </div>
          {status === 'error' && (
            <p style={{ color: 'var(--clr-error, #dc2626)', fontWeight: 600, marginBottom: '0.75rem' }}>{errorMsg}</p>
          )}
          <button type="submit" className="cf-btn" disabled={status === 'sending'}>
            {status === 'sending' ? tr.sending : tr.submit}
          </button>
          <p className="cf-note">
            <strong>{tr.noteLabel}</strong> {tr.note}
          </p>
        </form>
      )}
    </div>
  );
}
