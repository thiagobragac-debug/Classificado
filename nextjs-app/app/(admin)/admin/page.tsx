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
    // Fake data for now, ideally fetch via Supabase RPC
    setStats({
      adsCount: 1542,
      newToday: 12,
      activeUsers: 50,
      pendingAuth: 1,
      reports: 0,
      revenue: 0
    })
  }, [])

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Dashboard</h1>
        <p className="adm-page-sub">Visão geral do portal Tauze Class em tempo real.</p>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid">
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val">{stats.adsCount}</div>
            <div className="adm-stat-lbl">Total de Anúncios</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val">{stats.newToday}</div>
            <div className="adm-stat-lbl">Novos Hoje</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val">{stats.activeUsers}</div>
            <div className="adm-stat-lbl">Usuários Ativos</div>
          </div>
        </div>
        <div className="adm-stat-card" style={{ borderColor: 'rgba(245,158,11,.3)' }}>
          <div>
            <div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{stats.pendingAuth}</div>
            <div className="adm-stat-lbl">Pendentes Aprovação</div>
          </div>
        </div>
        <div className="adm-stat-card" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
          <div>
            <div className="adm-stat-val" style={{ color: 'var(--adm-red)' }}>{stats.reports}</div>
            <div className="adm-stat-lbl">Denúncias Abertas</div>
          </div>
        </div>
        <div className="adm-stat-card">
          <div>
            <div className="adm-stat-val" style={{ fontSize: '1.4rem' }}>R$ {stats.revenue}</div>
            <div className="adm-stat-lbl">Receita do Mês</div>
          </div>
        </div>
      </div>
    </>
  )
}
