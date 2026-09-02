import React from 'react'
import type { Metadata } from 'next'
import VerificacaoClient from './VerificacaoClient'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6): metadata estática — o título
// da aba ficava fixo em português mesmo com o corpo da página inteiro
// renderizando em espanhol. Mesmo padrão de generateMetadata() já usado em
// app/(public)/planos/page.tsx.
// BUG CORRIGIDO (auditoria de SEO — marca duplicada/incorreta no title): o
// title levava um sufixo manual "| Classificados" (nome que não é o da
// marca) e ainda ficava com "| Tauze Class" duplicado por cima, aplicado
// pelo title.template do layout raiz (app/(public)/layout.tsx: `template:
// '%s | Tauze Class'`) — resultado na aba era "Verificação de Identidade |
// Classificados | Tauze Class". Basta o title puro aqui; o layout raiz já
// aplica " | Tauze Class" sozinho via template (mesmo padrão corrigido em
// app/(public)/planos/page.tsx).
const METADATA_I18N = {
  pt: {
    title: 'Verificação de Identidade',
    description: 'Obtenha seu selo de verificação',
  },
  es: {
    title: 'Verificación de Identidad',
    description: 'Obtén tu sello de verificación',
  },
} as const

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang()
  return { ...METADATA_I18N[lang], robots: { index: false, follow: false } }
}

export default function VerificacaoPage() {
  return <VerificacaoClient />
}
