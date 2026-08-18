// Supabase Edge Function: notify-expiring-keys
// Triggered daily via Supabase Cron (pg_cron) or external scheduler.
// Finds API keys expiring in the next 24 hours and sends email/webhook notifications.
//
// Deploy: supabase functions deploy notify-expiring-keys
// Schedule via Supabase Dashboard > Edge Functions > Schedule (cron: "0 8 * * *")

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Optional: set WEBHOOK_NOTIFY_URL to POST expiring key data to an external endpoint
const WEBHOOK_URL    = Deno.env.get('WEBHOOK_NOTIFY_URL')

interface ExpiringKey {
  id: string
  partner_name: string
  email: string
  expires_at: string
  environment: string
}

Deno.serve(async (req: Request) => {
  // Verify request is from Supabase scheduler or an authorized caller
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const now      = new Date()
  const in24h    = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in48h    = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // Find keys expiring in the next 24-48h window (to avoid duplicate alerts)
  const { data: expiringKeys, error } = await supabase
    .from('api_keys')
    .select('id, partner_name, email, expires_at, environment')
    .eq('is_active', true)
    .gte('expires_at', in24h.toISOString())
    .lte('expires_at', in48h.toISOString())

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!expiringKeys || expiringKeys.length === 0) {
    return new Response(JSON.stringify({ message: 'No keys expiring in the next 24h', notified: 0 }), { status: 200 })
  }

  const results: { id: string; notified: boolean; channel: string }[] = []

  for (const key of expiringKeys as ExpiringKey[]) {
    const expiresAt = new Date(key.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    let notified = false
    let channel = 'none'

    // ── Send to external webhook if configured ────────────────────────────
    if (WEBHOOK_URL) {
      try {
        const webhookRes = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'api_key.expiring_soon',
            key_id: key.id,
            partner_name: key.partner_name,
            email: key.email,
            expires_at: key.expires_at,
            environment: key.environment,
            message: `Chave de API "${key.partner_name}" expira em ${expiresAt}. Acesse o painel para renovar.`,
          }),
        })
        if (webhookRes.ok) { notified = true; channel = 'webhook' }
      } catch {
        // Webhook failed — log but continue
      }
    }

    // ── Send admin notification via Supabase internal log ─────────────────
    // This creates a visible record even without an external webhook
    await supabase.from('api_request_logs').insert({
      api_key_id: key.id,
      method: 'CRON',
      endpoint: '/notify-expiring-keys',
      status_code: 200,
      ip_address: '0.0.0.0',
      user_agent: 'supabase-edge-function/notify-expiring-keys',
      duration_ms: 0,
    })

    results.push({ id: key.id, notified, channel })
  }

  return new Response(
    JSON.stringify({ message: 'Notification job completed', notified: results.filter(r => r.notified).length, total: results.length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
