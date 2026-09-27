import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isForbiddenOrigin } from '@/lib/csrf-origin'

// Amostra a saúde do sistema SOB DEMANDA, sem esperar a próxima rodada
// horária do monitor externo (scripts/monitor-render-supabase.mjs). Roda
// dentro do próprio processo Next.js em produção -- não precisa da API do
// Render pra isso (só memória/uptime do processo atual + uma RPC no
// Supabase), por isso não exige RENDER_API_KEY.
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

  const admin = createAdminClient()
  const { data: metrics, error: metricsErr } = await admin.rpc('get_system_health_metrics').single()
  if (metricsErr) {
    return NextResponse.json({ error: `Falha consultando métricas: ${metricsErr.message}` }, { status: 500 })
  }

  const mem = process.memoryUsage()
  const row = {
    rss_bytes: mem.rss,
    heap_used_bytes: mem.heapUsed,
    heap_total_bytes: mem.heapTotal,
    uptime_seconds: Math.round(process.uptime()),
    db_size_bytes: (metrics as any).db_size_bytes,
    pg_connections_active: (metrics as any).pg_connections_active,
    pg_connections_max: (metrics as any).pg_connections_max,
    upstash_configured: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    webhook_failures_24h: (metrics as any).webhook_failures_24h,
    source: 'check-now-button',
  }

  const { error: insertErr } = await admin.from('system_health_samples').insert(row)
  if (insertErr) {
    return NextResponse.json({ error: `Falha salvando amostra: ${insertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, sample: row })
}
