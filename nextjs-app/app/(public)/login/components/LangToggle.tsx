'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLang } from '@/lib/lang-context'
import { switchLocalePath, switchLocaleQuery } from '@/lib/locale'

// BUG CORRIGIDO (migração de SEO): igual ao seletor do Header — botões que só
// trocavam cookie/estado, sem gerar nenhuma URL seguível, viraram links reais.
export function LangToggle() {
  const { lang, t } = useLang()
  const pathname = usePathname()

  return (
    // BUG CORRIGIDO (i18n): aria-label do grupo estava fixo em português
    <div className="lang-toggle" role="group" aria-label={t('selectLanguage')} style={{ position: 'fixed', top: '1.2rem', right: '1.2rem', zIndex: 999 }}>
      <Link href={switchLocalePath(pathname, 'pt') + switchLocaleQuery('pt', '')} className={lang === 'pt' ? 'active' : ''} aria-label="Português">PT</Link>
      <Link href={switchLocalePath(pathname, 'es') + switchLocaleQuery('es', '')} className={lang === 'es' ? 'active' : ''} aria-label="Español">ES</Link>
    </div>
  )
}
