'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { useLang } from '@/lib/lang-context'
import { switchLocalePath, switchLocaleQuery } from '@/lib/locale'

// BUG CORRIGIDO (migração de SEO): igual ao seletor do Header — botões que só
// trocavam cookie/estado, sem gerar nenhuma URL seguível, viraram links reais.
//
// BUG CORRIGIDO (achado ao vivo, 2026-09-03): eram <Link> do Next (navegação
// client-side) — mesma classe de bug já corrigida no seletor do Header.tsx
// por dois motivos que se aplicam aqui também: (1) o Next PREFETCHA um
// <Link> em segundo plano só por ele estar no DOM, e cada prefetch de /es/...
// batia em proxy.ts como se fosse o usuário escolhendo espanhol de propósito
// (ver o mesmo bug corrigido em proxy.ts, bloco de troca explícita de
// idioma); (2) mesmo corrigindo o proxy pra exigir uma navegação de
// verdade (Sec-Fetch-Mode: navigate), um <Link> clicado de VERDADE navega
// via fetch() client-side do próprio Next (Sec-Fetch-Mode: cors, igual a um
// prefetch) — indistinguível de um prefetch nesse header, então o clique
// real também parava de funcionar. <a> pura resolve os dois: nunca é
// prefetchada, e um clique de verdade sempre é uma navegação de topo real.
export function LangToggle() {
  const { lang, t } = useLang()
  const pathname = usePathname()

  return (
    // BUG CORRIGIDO (i18n): aria-label do grupo estava fixo em português
    <div className="lang-toggle" role="group" aria-label={t('selectLanguage')} style={{ position: 'fixed', top: '1.2rem', right: '1.2rem', zIndex: 999 }}>
      <a data-lang="pt" href={switchLocalePath(pathname, 'pt') + switchLocaleQuery('pt', '')} className={lang === 'pt' ? 'active' : ''} aria-label="Português">PT</a>
      <a data-lang="es" href={switchLocalePath(pathname, 'es') + switchLocaleQuery('es', '')} className={lang === 'es' ? 'active' : ''} aria-label="Español">ES</a>
    </div>
  )
}
