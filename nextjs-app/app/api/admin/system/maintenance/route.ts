import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isForbiddenOrigin } from '@/lib/csrf-origin'
import { logAdminAction } from '@/lib/admin-audit'

// Modo de manutenção do Render (PATCH /v1/services/{id} -- não existe
// endpoint dedicado, é um campo dentro de serviceDetails). Sugerido pelo
// usuário junto com o resto do dashboard de monitoramento; deliberadamente
// SEM automação nenhuma tocando esta rota -- ativar tira o site do ar de
// propósito pra usuários reais, só um clique humano decide isso.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  return { supabase }
}

export async function GET(request: Request) {
  if (isForbiddenOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  const apiKey = process.env.RENDER_API_KEY
  const serviceId = process.env.RENDER_SERVICE_ID
  if (!apiKey || !serviceId) {
    return NextResponse.json({ error: 'RENDER_API_KEY/RENDER_SERVICE_ID não configuradas.' }, { status: 500 })
  }

  const res = await fetch(`https://api.render.com/v1/services/${serviceId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    return NextResponse.json({ error: `Render respondeu HTTP ${res.status}` }, { status: 502 })
  }
  const service = await res.json()
  return NextResponse.json({ enabled: !!service.serviceDetails?.maintenanceMode?.enabled })
}

export async function POST(request: Request) {
  if (isForbiddenOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  let body: { enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` deve ser boolean' }, { status: 400 })
  }

  const apiKey = process.env.RENDER_API_KEY
  const serviceId = process.env.RENDER_SERVICE_ID
  if (!apiKey || !serviceId) {
    return NextResponse.json({ error: 'RENDER_API_KEY/RENDER_SERVICE_ID não configuradas.' }, { status: 500 })
  }

  const res = await fetch(`https://api.render.com/v1/services/${serviceId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceDetails: { maintenanceMode: { enabled: body.enabled, uri: '' } } }),
  })

  await logAdminAction(guard.supabase, body.enabled ? 'enable_maintenance_mode' : 'disable_maintenance_mode', 'render_service', serviceId, {
    renderResponseStatus: res.status,
  })

  if (!res.ok) {
    const details = await res.text().catch(() => '')
    return NextResponse.json({ error: `Render respondeu HTTP ${res.status}`, details }, { status: 502 })
  }

  return NextResponse.json({ success: true, enabled: body.enabled })
}
