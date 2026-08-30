import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'
import PricingClientUI, { Plan } from './PricingClientUI'
import { getLocale } from '@/lib/locale-server'

type Lang = 'pt' | 'es'

// BUG CORRIGIDO (auditoria completa de i18n, 2026-08-26/27): metadata era um
// objeto estático sempre em português — visitantes com tc_lang=es viam
// title/description em PT na aba do navegador e nos resultados de busca.
// Convertido para generateMetadata(), mesmo padrão já usado em
// app/(public)/eventos/[id]/page.tsx.
// BUG CORRIGIDO (auditoria de SEO — marca duplicada/incorreta no title):
// o title levava um sufixo manual "| Classificado Agro" (nome que não é o
// da marca) e ainda ficava com o sufixo "| Tauze Class" duplicado por cima,
// aplicado pelo title.template do layout raiz (app/(public)/layout.tsx:
// `template: '%s | Tauze Class'`) — resultado na aba do navegador era
// "Planos e Preços | Classificado Agro | Tauze Class". Basta o title puro
// aqui; o layout raiz já aplica " | Tauze Class" sozinho via template
// (mesmo padrão de app/(public)/eventos/page.tsx: title: 'Agenda de
// Eventos', sem sufixo nenhum).
const METADATA_I18N = {
  pt: {
    title: 'Planos e Preços',
    description: 'Escolha o melhor plano para anunciar e vender mais rápido no maior classificado agro do Mercosul.',
  },
  es: {
    title: 'Planes y Precios',
    description: 'Elige el mejor plan para publicar y vender más rápido en el mayor clasificado agro del Mercosur.',
  },
} as const

const LOADING_I18N = {
  pt: 'Carregando planos...',
  es: 'Cargando planes...',
} as const

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale()
  return METADATA_I18N[lang]
}

// Revalidate this page every hour (ISR)
export const revalidate = 3600;

export default async function PlanosPage() {
  // SSR / ISR: Fetch plans on the server directly via REST API
  // This avoids client-side Supabase setup issues in Server Components and is blazing fast for SEO
  let plans: Plan[] = []
  // BUG CORRIGIDO (varredura cruzada de cenários): sem esta flag, uma
  // falha real de rede/RLS produzia o mesmo `plans=[]` de "tabela
  // genuinamente vazia" — PricingClientUI não tinha como distinguir os
  // dois casos e renderizava o grid/tabela em branco sem explicação.
  let plansError = false
  const lang = await getLocale()

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/plans?is_active=eq.true&order=sort_order.asc`, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json'
      },
      next: { revalidate: 3600 }
    })

    if (res.ok) {
      const rawPlans = await res.json()

      // Parse JSON features exactly once on the server
      plans = rawPlans.map((p: any) => {
        let featuresList: string[] = []
        try {
          featuresList = typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || [])
        } catch(e) {
          featuresList = []
        }

        // GAP CORRIGIDO (auditoria completa de i18n, 2026-08-26/27):
        // plans.features_es (jsonb, já populada pra migration + script) nunca
        // era lida — mesmo tratamento defensivo do features_pt acima, pro
        // caso a coluna venha como string em vez de array já parseado.
        let featuresListEs: string[] = []
        try {
          featuresListEs = typeof p.features_es === 'string' ? JSON.parse(p.features_es) : (p.features_es || [])
        } catch(e) {
          featuresListEs = []
        }

        // Try to infer tier if not set in DB
        let tier = p.tier || (p.sort_order === 1 ? 'free' : p.sort_order === 2 ? 'pro' : p.sort_order === 3 ? 'premium' : '')

        return {
          ...p,
          featuresList,
          featuresListEs,
          tier
        } as Plan
      })
    } else {
      console.error('Failed to fetch plans for SSR:', await res.text())
      plansError = true
    }
  } catch (error) {
    console.error('Network error fetching plans:', error)
    plansError = true
  }

  return (
    // Suspense required: PricingClientUI uses useSearchParams() internally.
    // Without this boundary, Next.js 14 would throw an error and disable ISR (revalidate=3600).
    <Suspense fallback={<div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#64748b' }}>{LOADING_I18N[lang]}</div>}>
      <PricingClientUI initialPlans={plans} plansError={plansError} />
    </Suspense>
  )
}
