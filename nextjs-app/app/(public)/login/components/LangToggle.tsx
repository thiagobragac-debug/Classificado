'use client'

import React from 'react'
import { useLang } from '@/lib/lang-context'

export function LangToggle() {
  const { lang, setLang, t } = useLang()

  return (
    // BUG CORRIGIDO (i18n): aria-label do grupo estava fixo em português
    <div className="lang-toggle" role="group" aria-label={t('selectLanguage')} style={{ position: 'fixed', top: '1.2rem', right: '1.2rem', zIndex: 999 }}>
      <button className={lang === 'pt' ? 'active' : ''} onClick={() => setLang('pt')} aria-label="Português">PT</button>
      <button className={lang === 'es' ? 'active' : ''} onClick={() => setLang('es')} aria-label="Español">ES</button>
    </div>
  )
}
