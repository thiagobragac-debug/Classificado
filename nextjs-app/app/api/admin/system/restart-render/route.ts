import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isForbiddenOrigin } from '@/lib/csrf-origin'
import { logAdminAction } from '@/lib/admin-audit'

// Reinicia o Web Service no Render (achado ao vivo, 26-27/set/2026: 3
// crashes de OOM em ~36h no plano Free, 512MB RAM). O Render já reinicia
// SOZINHO quando detecta o OOM de verdade (~1min) -- este botão existe pro
// caso em que um admin vê a memória subindo perto do limite no gráfico de
// /admin/monitoramento e prefere reiniciar ANTES de crashar, evitando a
// janela de indisponibilidade do auto-restart reativo.
//
// Deliberadamente SEM automação: nenhum monitor/cron chama esta rota
// sozinho. Reiniciar automaticamente mascararia um vazamento de memória
// piorando (a mesma classe de problema, só que invisível) e arrisca um
// loop de restart se a causa for persistente -- fica sempre a um clique
// humano de distância, nunca decisão de máquina.
export async function POST(request: Request) {
  if (isForbiddenOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const apiKey = process.env.RENDER_API_KEY
  const serviceId = process.env.RENDER_SERVICE_ID
  if (!apiKey || !serviceId) {
    return NextResponse.json(
      { error: 'RENDER_API_KEY/RENDER_SERVICE_ID não configuradas no ambiente do servidor.' },
      { status: 500 }
    )
  }

  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/restart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  await logAdminAction(supabase, 'restart_render_service', 'render_service', serviceId, {
    triggeredFromDashboard: true,
    renderResponseStatus: res.status,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return NextResponse.json({ error: `Render respondeu HTTP ${res.status}`, details: body }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
