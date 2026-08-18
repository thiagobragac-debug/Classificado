import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rfzuzuobwuanmbrcthqe.supabase.co'

/**
 * Creates a Supabase ADMIN client using the service_role key.
 *
 * The service_role key bypasses ALL Row Level Security (RLS) policies.
 * This is required for server-side operations like:
 *   - Webhook handlers (writing to subscriptions + profiles)
 *   - Checkout API (writing subscriptions on behalf of users)
 *   - Reading platform_settings (some keys are hidden from anon)
 *
 * ⚠️  NEVER expose this client or service_role key to the browser.
 * ⚠️  ALWAYS use inside Next.js API routes or server components only.
 *
 * Setup: add SUPABASE_SERVICE_ROLE_KEY to .env.local
 *   Supabase Dashboard → Project Settings → API → service_role key
 */
export function createAdminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    // In development: fallback to anon key and warn loudly
    // In production: this will cause RLS-blocked writes to fail
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Crítico] SUPABASE_SERVICE_ROLE_KEY não configurado! ' +
        'Webhooks e checkout não conseguirão escrever no banco. ' +
        'Configure em: Supabase Dashboard → Settings → API → service_role'
      )
    }
    console.warn(
      '[Aviso] SUPABASE_SERVICE_ROLE_KEY não configurado. ' +
      'Usando anon key — operações de escrita podem falhar por RLS em subscriptions/profiles.'
    )
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false }
    })
  }

  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false }
  })
}

/**
 * Fetches all platform settings from the key-value table and returns them as a flat object.
 * e.g. { stripe_secret_key: '...', mp_access_token: '...', ... }
 *
 * Note: sensitive keys (stripe_secret_key, mp_access_token, etc.) are protected by
 * RLS — only accessible via service_role. The createAdminClient() must be used.
 */
export async function getSettings(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('platform_settings').select('key, value')
  if (error) throw new Error('Falha ao carregar configurações da plataforma: ' + error.message)
  const settings: Record<string, string> = {}
  ;(data || []).forEach((row: { key: string; value: string }) => {
    settings[row.key] = row.value ?? ''
  })
  return settings
}
