'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/lib/lang-context';

const PWA_TEXT = {
  pt: { title: 'Instale o App', bodyPrefix: 'Adicione o', bodySuffix: 'à sua tela inicial para acesso rápido!', install: 'Instalar App', dismiss: 'Agora não' },
  es: { title: 'Instala la App', bodyPrefix: 'Agrega', bodySuffix: 'a tu pantalla de inicio para un acceso rápido!', install: 'Instalar App', dismiss: 'Ahora no' },
} as const;

export function PwaPrompt() {
  const { lang } = useLang();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();

      const lastDismissed = localStorage.getItem('tc_pwa_dismissed');
      if (lastDismissed && (Date.now() - parseInt(lastDismissed, 10)) < 30 * 24 * 60 * 60 * 1000) {
        return; // Don't show if dismissed within the last 30 days
      }

      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 4000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  if (!show || !deferredPrompt) return null;

  const handleInstall = async () => {
    setShow(false);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA prompt');
    } else {
      console.log('User dismissed the PWA prompt');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('tc_pwa_dismissed', Date.now().toString());
  };

  return (
    <div className="tc-toast-container pwa-modal-active" style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#fff', padding: '16px 20px', borderRadius: 12,
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
      border: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 16,
      maxWidth: 380, animation: 'toast-slide-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#0f172a' }}>{PWA_TEXT[lang].title}</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
          {PWA_TEXT[lang].bodyPrefix} <strong>Tauze Class</strong> {PWA_TEXT[lang].bodySuffix}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={handleInstall} style={{
            background: '#16A34A', color: 'white', border: 'none', padding: '6px 14px',
            borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
          }}>{PWA_TEXT[lang].install}</button>
          <button onClick={handleDismiss} style={{
            background: 'transparent', color: '#64748b', border: 'none', padding: '6px 14px',
            borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer'
          }}>{PWA_TEXT[lang].dismiss}</button>
        </div>
      </div>
    </div>
  );
}
