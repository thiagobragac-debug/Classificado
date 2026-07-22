'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPage() {
  const router = useRouter()

  useEffect(() => {
    // Clear caches
    try { localStorage.removeItem('user_loc_v3'); } catch(_) {}
    const statsKeys = ['tc_platform_stats_v4','tc_platform_stats_v3','tc_platform_stats_v2','tc_platform_stats'];
    statsKeys.forEach(k => { try { sessionStorage.removeItem(k); } catch(_) {} });
    
    // Redirect after a short delay
    const timer = setTimeout(() => {
      router.push('/')
    }, 800)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div style={{
      fontFamily: 'sans-serif', background: '#0f172a', color: '#e2e8f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', margin: 0, flexDirection: 'column', gap: '16px'
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />
      <div style={{
        width: '40px', height: '40px', border: '3px solid #334155',
        borderTopColor: '#22c55e', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}></div>
      <div style={{ color: '#22c55e', fontSize: '1.2rem' }}>
        Limpando cache e redirecionando...
      </div>
    </div>
  )
}
