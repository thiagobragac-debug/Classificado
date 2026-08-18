'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    adsCount: 0,
    newToday: 0,
    activeUsers: 0,
    pendingAuth: 0,
    reports: 0,
    revenue: 0
  })

  useEffect(() => {
    loadRealStats()
  }, [])

  async function loadRealStats() {
    const supabase = getSupabase()
    
    // Total Ads
    const { count: adsCount } = await supabase.from('ads').select('*', { count: 'exact', head: true })
    
    // Active Users (Verified or just total)
    const { count: activeUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    
    // Pending Auth (KYC pending)
    const { count: pendingAuth } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending')
    
    // Open Reports (assuming reports table exists, else fallback to 0)
    const { count: reports } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open').catch(() => ({ count: 0 }))
    
    // New Today (Ads created today)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: newToday } = await supabase.from('ads').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString())

    setStats({
      adsCount: adsCount || 0,
      newToday: newToday || 0,
      activeUsers: activeUsers || 0,
      pendingAuth: pendingAuth || 0,
      reports: reports || 0,
      revenue: 0 // Keep 0 for now until payment integration is done
    })
  }

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Dashboard</h1>
        <p className="adm-page-sub">Visão geral do portal Tauze Class em tempo real.</p>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val">{stats.activeUsers}</div>
            <div className="adm-stat-lbl">Usuários Ativos</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val">{stats.adsCount}</div>
            <div className="adm-stat-lbl">Total de Anúncios</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val" style={{ fontSize: '1.4rem', color: 'var(--adm-green)' }}>R$ {stats.revenue}</div>
            <div className="adm-stat-lbl">Receita do Mês</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{stats.reports}</div>
            <div className="adm-stat-lbl">Denúncias Abertas</div>
          </div>
        </div>
      </div>
    </>
  )
}
