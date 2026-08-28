'use client';

import { useState } from 'react';

// BUG CORRIGIDO (validação do zero, rodada 6): componente inteiro (aria-label,
// "Compartilhar", "Copiado!") ficava fixo em português mesmo com ES
// selecionado — nunca recebia o idioma ativo. Mesmo padrão local já usado em
// outros componentes de anúncio.
const TRANSLATIONS = {
  pt: { share: 'Compartilhar anúncio', shareLabel: 'Compartilhar', copied: 'Copiado!' },
  es: { share: 'Compartir anuncio', shareLabel: 'Compartir', copied: '¡Copiado!' },
} as const;

interface ShareButtonProps {
  title: string;
  text: string;
  url?: string;
  className?: string;
  lang?: 'pt' | 'es';
}

export function ShareButton({ title, text, url, className, lang = 'pt' }: ShareButtonProps) {
  const T = TRANSLATIONS[lang] || TRANSLATIONS.pt;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const shareData = { title, text, url: shareUrl };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Erro ao compartilhar', err);
          fallbackCopy(shareUrl);
        }
      }
    } else {
      fallbackCopy(shareUrl);
    }
  };

  const fallbackCopy = (shareUrl: string) => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button 
      onClick={handleShare}
      className={className}
      aria-label={T.share}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.35rem',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: 600, padding: 0
      }}
    >
      {copied ? (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg> {T.copied}
        </>
      ) : (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          {T.shareLabel}
        </>
      )}
    </button>
  );
}
