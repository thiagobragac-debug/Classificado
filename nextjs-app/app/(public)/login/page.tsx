import React, { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase'
import { LoginBanner } from './components/LoginBanner'
import { AuthContainer } from './components/AuthContainer'
import { LangToggle } from './components/LangToggle'
import './page.module.css'

export const metadata = {
  title: 'Login - Tauze Class',
  description: 'Acesse sua conta para anunciar no agronegócio do Brasil e Mercosul.',
}

// Cache the platform logo query so it doesn't hit the DB on every render.
// The cache key is 'platform-logo'. We revalidate every 24 hours (86400 seconds).
const getCachedPlatformLogo = unstable_cache(
  async () => {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
      const { data } = await supabase.from('platform_settings').select('logo_url').single()
      if (data?.logo_url && !data.logo_url.startsWith('javascript')) {
        return data.logo_url
      }
    } catch (error) {
      console.error('Failed to fetch platform logo:', error)
    }
    return null
  },
  ['platform-logo'],
  { revalidate: 86400 } // 24 hours
)

export default async function LoginPage() {
  const logoUrl = await getCachedPlatformLogo()

  return (
    <main className="login-split v2">
      <LangToggle />
      <LoginBanner logoUrl={logoUrl} />
      
      <div className="login-form-area">
        <Suspense fallback={
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <div style={{ height: '40px', background: 'rgba(0,0,0,0.05)', borderRadius: '99px', marginBottom: '1.5rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '1.5rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '16px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', width: '30%', marginBottom: '0.5rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '1rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '16px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', width: '30%', marginBottom: '0.5rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '2rem' }} className="skeleton-pulse"></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }} className="skeleton-pulse"></div>
          </div>
        }>
          <AuthContainer />
        </Suspense>
      </div>
    </main>
  )
}
