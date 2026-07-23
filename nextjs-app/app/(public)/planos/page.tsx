import React from 'react'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'
import PricingClientUI, { Plan } from './PricingClientUI'

export const metadata = {
  title: 'Planos e Preços | Classificado Agro',
  description: 'Escolha o melhor plano para anunciar e vender mais rápido no maior classificado agro do Mercosul.'
}

// Revalidate this page every hour (ISR)
export const revalidate = 3600; 

export default async function PlanosPage() {
  // SSR / ISR: Fetch plans on the server directly via REST API 
  // This avoids client-side Supabase setup issues in Server Components and is blazing fast for SEO
  let plans: Plan[] = []

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

        // Try to infer tier if not set in DB
        let tier = p.tier || (p.sort_order === 1 ? 'free' : p.sort_order === 2 ? 'pro' : p.sort_order === 3 ? 'premium' : '')

        return {
          ...p,
          featuresList,
          tier
        } as Plan
      })
    } else {
      console.error('Failed to fetch plans for SSR:', await res.text())
    }
  } catch (error) {
    console.error('Network error fetching plans:', error)
  }

  return (
    <PricingClientUI initialPlans={plans} />
  )
}
