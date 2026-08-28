import React from 'react'
import type { Metadata } from 'next'
import VerificacaoClient from './VerificacaoClient'
import { getRequestLang } from '@/lib/api-lang'

// BUG CORRIGIDO (validação do zero, rodada 6): metadata estática — o título
// da aba ficava fixo em português mesmo com o corpo da página inteiro
// renderizando em espanhol. Mesmo padrão de generateMetadata() já usado em
// app/(public)/planos/page.tsx.
const METADATA_I18N = {
  pt: {
    title: 'Verificação de Identidade | Classificados',
    description: 'Obtenha seu selo de verificação',
  },
  es: {
    title: 'Verificación de Identidad | Clasificados',
    description: 'Obtén tu sello de verificación',
  },
} as const

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang()
  return METADATA_I18N[lang]
}

export default function VerificacaoPage() {
  return <VerificacaoClient />
}
