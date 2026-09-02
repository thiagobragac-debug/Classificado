import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { assinaturaConfere } from '@/lib/gateways/signature'

// Fallback automático da janela de graça de anuncios excedentes (ver
// supabase/migrations/20260901110000_grace_period_pausa_anuncios_excedentes.sql).
// enforce_ad_quota_deadlines() é pura SQL (sem chamada a gateway externo),
// então a rota só existe pra dar um endpoint agendável ao pg_cron do Vercel —
// mesmo padrão de autenticação de app/api/internal/expire-stale-subscriptions.
//
// Vercel Cron dispara via GET (ver vercel.json).
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[EnforceAdQuotaDeadlines] CRON_SECRET não configurado — recusando execução.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization')
  if (!assinaturaConfere(`Bearer ${cronSecret}`, authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('enforce_ad_quota_deadlines')

  if (error) {
    console.error('[EnforceAdQuotaDeadlines] Falha ao aplicar prazos vencidos:', error.message)
    return NextResponse.json({ error: 'Falha ao aplicar prazos vencidos.' }, { status: 500 })
  }

  return NextResponse.json({ processed: data ?? 0 })
}
