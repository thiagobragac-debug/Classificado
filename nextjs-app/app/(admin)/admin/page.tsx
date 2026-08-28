'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

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

    // BUG CORRIGIDO: supabase.from(...).select(...) não tem método .catch()
    // (não é uma Promise nativa, é um PostgrestBuilder — thenable, mas sem
    // catch/finally). A chamada `.catch(() => ({count: 0}))` lançava
    // TypeError síncrono ("...catch is not a function") ANTES mesmo de
    // awaitar a consulta de denúncias, o que abortava loadRealStats inteira
    // com uma promise rejeitada — como o setStats(...) só roda no final da
    // função, NENHUM dos 5 valores (mesmo os já buscados com sucesso antes
    // dessa linha) chegava a ser aplicado. Resultado real: o dashboard
    // ficava travado nos zeros iniciais para sempre, não importa quantos
    // usuários/anúncios existissem. Cada consulta agora trata seu próprio
    // erro (tabela 'reports' pode nem existir ainda) sem derrubar as demais.
    // select('id', ...) em vez de select('*', ...): profiles.is_admin/
    // is_blocked deixaram de ter grant público (achado de segurança
    // 2026-08-24) e um select com * exige acesso a toda coluna da
    // tabela mesmo num count com head:true, que não devolve linha nenhuma.
    try {
      const [adsRes, usersRes, pendingRes, reportsRes] = await Promise.all([
        supabase.from('ads').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
        // BUG CORRIGIDO (validação de 2026-08-26): 'open' não é um valor real
        // do enum de reports.status (pending/resolved/dismissed) — o KPI
        // sempre mostrava 0, mesmo com denúncia pendente de verdade.
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ])

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const newTodayRes = await supabase.from('ads').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString())

      setStats({
        adsCount: adsRes.count || 0,
        newToday: newTodayRes.count || 0,
        activeUsers: usersRes.count || 0,
        pendingAuth: pendingRes.count || 0,
        reports: reportsRes.error ? 0 : (reportsRes.count || 0),
        revenue: 0 // Keep 0 for now until payment integration is done
      })
    } catch (err) {
      // GAP CORRIGIDO: sem try/catch, uma falha de rede deixava o dashboard
      // travado em zeros sem nenhum aviso ao admin.
      showToast('Erro ao carregar estatísticas: ' + (err as Error).message, 'error')
    }
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
            {/* BUG CORRIGIDO: rótulo "Ativos" mas a query conta TODO profile
                cadastrado, inclusive bloqueados (sem filtro de is_blocked,
                coluna que sequer existe em profiles) — renomeado pra bater
                com o que de fato é medido. */}
            <div className="adm-stat-lbl">Usuários Cadastrados</div>
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
