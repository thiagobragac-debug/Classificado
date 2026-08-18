import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import {
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayName,
  GatewayAdapter,
} from '@/lib/gateways'

/**
 * Webhook handler for all payment gateways.
 *
 * Identify the gateway via:
 *   - Header: x-gateway: stripe | mercadopago | pagarme | asaas
 *   - Query param: ?gateway=stripe
 *
 * Each gateway validates its own signature/token before processing.
 *
 * On successful event, updates subscriptions + profiles tables.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url)

    // IMPORTANT: read raw body as text for signature validation BEFORE parsing
    const rawBody = await req.text()

    // Collect all headers as lowercase map
    const headers: Record<string, string> = {}
    req.headers.forEach((val, key) => { headers[key.toLowerCase()] = val })

    // Identify gateway
    const gateway = (
      headers['x-gateway'] ||
      headers['x-source'] ||
      url.searchParams.get('gateway') || ''
    ).toLowerCase() as GatewayName

    if (!gateway) {
      return NextResponse.json({ error: 'Missing gateway identifier (x-gateway header or ?gateway= param)' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const settings = await getSettings(supabase)

    // Build adapter + pick webhook secret for this gateway
    let adapter: GatewayAdapter
    let webhookSecret = ''

    switch (gateway) {
      case 'stripe':
        adapter = stripeAdapter(settings['stripe_secret_key'] || '')
        webhookSecret = settings['stripe_webhook_secret'] || ''
        break
      case 'mercadopago':
        adapter = mercadoPagoAdapter(settings['mp_access_token'] || '')
        webhookSecret = settings['mp_webhook_secret'] || ''
        break
      case 'pagarme':
        adapter = pagarmeAdapter(settings['pagarme_api_key'] || '')
        webhookSecret = settings['pagarme_webhook_secret'] || ''
        break
      case 'asaas':
        adapter = asaasAdapter(
          settings['asaas_api_key'] || '',
          (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'
        )
        // Asaas uses a static token header comparison, passed as "secret"
        webhookSecret = settings['asaas_webhook_token'] || ''
        break
      default:
        return NextResponse.json({ error: `Gateway '${gateway}' not supported` }, { status: 400 })
    }

    // Validate webhook signature (each adapter handles its own method)
    const event = await adapter.validateWebhook(rawBody, headers, webhookSecret)

    if (event.type === 'unknown') {
      // Gateway sent an event we don't handle — acknowledge it without error
      return NextResponse.json({ received: true, handled: false })
    }

    // --- Idempotency Check ---
    if (event.eventId) {
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('id', event.eventId)
        .maybeSingle()

      if (existingEvent) {
        console.info(`[Webhook:${gateway}] Event ${event.eventId} already processed. Skipping.`)
        return NextResponse.json({ received: true, handled: true, duplicate: true })
      }

      // Log event to prevent future processing
      const { error: insertError } = await supabase
        .from('webhook_events')
        .insert({ id: event.eventId, gateway, event_type: event.type })
      
      if (insertError) {
        console.error(`[Webhook:${gateway}] Idempotency race condition blocked for event ${event.eventId}:`, insertError.message)
        // If it fails to insert (likely a duplicate unique key due to concurrent request), we MUST ABORT!
        return NextResponse.json({ error: 'Duplicate webhook processing' }, { status: 409 })
      }
    }

    // --- Find the subscription in our DB ---
    // Try by gateway_subscription_id first, fallback to user_id via externalReference
    let sub: any = null

    if (event.gatewaySubscriptionId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('gateway_subscription_id', event.gatewaySubscriptionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      sub = data
    }

    // Fallback: use externalReference (which is now the subscription UUID)
    if (!sub && event.externalReference) {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', event.externalReference)
        .maybeSingle()
      sub = data
    }

    if (!sub) {
      // Unknown subscription — return 404 to force gateway retry (race condition with checkout)
      console.warn(`[Webhook:${gateway}] Subscription not found for event`, event.type, event.gatewaySubscriptionId)
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    // --- Apply update based on event type ---
    const now = new Date()
    let updateData: Record<string, any> = {}

    // Smart activation vs renewal:
    // Asaas and MP send the same event for first payment and recurring payments.
    // If subscription is already 'active', treat 'activated' as 'renewed' to extend period correctly.
    let effectiveType = event.type
    if (event.type === 'subscription.activated' && sub.status === 'active') {
      effectiveType = 'subscription.renewed'
      console.info(`[Webhook:${gateway}] Sub ${sub.id} already active — treating as renewal`)
    }

    if (effectiveType === 'subscription.activated') {
      updateData.status = 'active'
      updateData.gateway_subscription_id = event.gatewaySubscriptionId || sub.gateway_subscription_id
      updateData.current_period_start = now.toISOString()
      updateData.updated_at = now.toISOString()
      const end = new Date(now)
      if (sub.billing_cycle === 'annual') end.setFullYear(end.getFullYear() + 1)
      else end.setMonth(end.getMonth() + 1)
      updateData.current_period_end = end.toISOString()

    } else if (effectiveType === 'subscription.renewed') {
      updateData.status = 'active'
      updateData.cancel_at_period_end = false  // reset if was pending cancellation
      updateData.updated_at = now.toISOString()
      // Extend from current period end (not from now) to avoid gaps
      const base = sub.current_period_end ? new Date(sub.current_period_end) : now
      if (sub.billing_cycle === 'annual') base.setFullYear(base.getFullYear() + 1)
      else base.setMonth(base.getMonth() + 1)
      updateData.current_period_end = base.toISOString()

    } else if (effectiveType === 'subscription.cancelled') {
      updateData.status = 'cancelled'
      updateData.cancel_at_period_end = true
      updateData.updated_at = now.toISOString()

    } else if (effectiveType === 'payment.failed') {
      updateData.status = 'past_due'
      updateData.updated_at = now.toISOString()
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateErr } = await supabase.from('subscriptions').update(updateData).eq('id', sub.id)
      if (updateErr) console.error(`[Webhook:${gateway}] Failed to update subscription:`, updateErr.message)
    }

    // --- Update user's plan in profiles table ---
    if (effectiveType === 'subscription.activated' || effectiveType === 'subscription.renewed') {
      // Map subscription plan name → sub_plan enum ('free' | 'pro' | 'premium')
      let planEnum = 'free'
      if (sub.plan.toLowerCase().includes('premium')) planEnum = 'premium'
      else if (sub.plan.toLowerCase().includes('pro')) planEnum = 'pro'

      // Lookup plan UUID from plans table
      const { data: planData } = await supabase.from('plans').select('id').eq('name', sub.plan).maybeSingle()

      // Update profiles: only subscription_status and expiry
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          plan_expires_at: updateData.current_period_end || null,
        })
        .eq('id', sub.user_id)
      if (profErr) console.error(`[Webhook:${gateway}] Failed to update profiles:`, profErr.message)

      // ALSO update user_secrets.plan and plan_id — this is what PainelClient reads
      const { error: secErr } = await supabase
        .from('user_secrets')
        .update({ 
          plan: planEnum,
          plan_id: planData?.id || null
        })
        .eq('id', sub.user_id)
      if (secErr) console.warn(`[Webhook:${gateway}] Could not update user_secrets (non-critical):`, secErr.message)
    }

    if (effectiveType === 'subscription.cancelled' || effectiveType === 'payment.failed') {
      // Logic for cancellation/failure: DO NOT downgrade immediately if they still have paid days left.
      let downgradeNow = true
      if (sub.current_period_end) {
        if (new Date(sub.current_period_end) > new Date()) {
          downgradeNow = false
        }
      }

      const statusToSet = effectiveType === 'subscription.cancelled' ? 'cancelled' : 'past_due'
      
      const profileUpdate: any = { subscription_status: statusToSet }
      if (downgradeNow) {
        profileUpdate.plan_expires_at = null
      }

      const { error: profErr2 } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', sub.user_id)
      if (profErr2) console.error(`[Webhook:${gateway}] Failed to reset profiles:`, profErr2.message)

      if (downgradeNow) {
        // Also reset user_secrets.plan and plan_id so PainelClient shows free and RLS is blocked
        await supabase.from('user_secrets').update({ plan: 'free', plan_id: null }).eq('id', sub.user_id)
      }
    }

    return NextResponse.json({ received: true, handled: true, eventType: event.type })

  } catch (err: any) {
    console.error('[Webhook] Error:', err.message)
    // Return 400 on auth/signature/token errors so gateway will retry
    // Return 200 on logic errors to stop infinite retries
    const isAuthError = err.message?.includes('Invalid signature') ||
      err.message?.includes('Invalid Stripe') ||
      err.message?.includes('Invalid MP') ||
      err.message?.includes('Invalid Asaas') ||
      err.message?.includes('Invalid Pagar') ||
      err.message?.includes('Missing') && err.message?.includes('signature')
    const status = isAuthError ? 400 : 200
    return NextResponse.json({ error: err.message }, { status })
  }
}
