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
import { resolverIpConfiavel, ipParaRateLimit } from '@/lib/ip-utils'
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback'

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

    // BUG CORRIGIDO (auditoria de segurança, 2026-08-30): esta rota é pública
    // por natureza (o gateway externo precisa alcançá-la sem sessão) e não
    // tinha nenhum teto de volume próprio — diferente de /api/checkout e
    // /api/checkout/tokenize-card, que já usam este mesmo fallback. Antes de
    // qualquer leitura ao banco (getSettings), barra volume anômalo por IP.
    // Limite generoso (gateways reais enviam rajadas legítimas em picos de
    // cobrança) — o objetivo é conter abuso de volume, não a validação de
    // assinatura em si, que continua sendo a autenticação real do evento.
    const ipWebhook = resolverIpConfiavel(req.headers)
    if (ipWebhook) {
      const permitido = await dentroDoLimiteFallback({
        bucket: `webhook_payments_${ipParaRateLimit(ipWebhook)}`,
        limit: 120,
        windowSeconds: 60,
        logPrefix: 'webhook-payments',
      })
      if (!permitido) {
        return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
      }
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

    // BUG CORRIGIDO (re-auditoria, 2026-08-30): webhook_events.id usava
    // event.eventId cru, sem namespace por gateway. Stripe usa IDs
    // prefixados (evt_...), mas o Mercado Pago cai no fallback `mp_${dataId}`
    // — um id numérico da própria plataforma, sem garantia de unicidade
    // global entre gateways diferentes. Uma colisão (mesmo improvável)
    // faria o segundo evento ser descartado como duplicata e o entitlement
    // do usuário nunca seria atualizado. Namespacing por gateway elimina
    // essa classe de colisão sem custo — cada gateway já sabe seu próprio id.
    const eventKey = event.eventId ? `${gateway}:${event.eventId}` : null

    // --- Idempotency Check (read-only) ---
    if (eventKey) {
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('id', eventKey)
        .maybeSingle()

      if (existingEvent) {
        console.info(`[Webhook:${gateway}] Event ${event.eventId} already processed. Skipping.`)
        return NextResponse.json({ received: true, handled: true, duplicate: true })
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
      // BUG CORRIGIDO (validação do zero, 4ª rodada): o INSERT em
      // webhook_events acontecia ANTES desta checagem — um 404 legítimo
      // (corrida com o checkout, evento chegando antes do INSERT local
      // commitar) já tinha gravado o evento como "processado". Qualquer
      // reenvio automático da Stripe pro MESMO evento (até 3 dias de
      // tentativas) caía no bloco de duplicata acima e nunca era
      // processado de verdade — o evento morria pra sempre na 1ª falha
      // transitória. Não registra nada aqui; só registra depois de achar
      // a assinatura, pra um retry real da Stripe poder de fato reprocessar.
      console.warn(`[Webhook:${gateway}] Subscription not found for event`, event.type, event.gatewaySubscriptionId)
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    // --- Idempotency: only mark as processed once we know we CAN process it ---
    if (eventKey) {
      const { error: insertError } = await supabase
        .from('webhook_events')
        .insert({ id: eventKey, gateway, event_type: event.type })

      if (insertError) {
        console.error(`[Webhook:${gateway}] Idempotency race condition blocked for event ${event.eventId}:`, insertError.message)
        // If it fails to insert (likely a duplicate unique key due to concurrent request), we MUST ABORT!
        return NextResponse.json({ error: 'Duplicate webhook processing' }, { status: 409 })
      }
    }

    // --- Apply update based on event type ---
    const now = new Date()
    let updateData: Record<string, any> = {}

    // BUG CORRIGIDO (validação do zero, 4ª rodada): invoice.payment_failed
    // não distinguia billing_reason — uma fatura de PRORAÇÃO recusada
    // (troca de plano nativa) caía no mesmo tratamento de uma renovação
    // recusada, marcando a assinatura e o cliente como "past_due" mesmo com
    // o plano ATUAL (que ele continua pagando em dia) intocado. O acesso
    // real nunca era perdido (o entitlement de upgrade já espera o webhook
    // de sucesso, então uma falha aqui simplesmente não concede nada), mas
    // o status ficava enganoso pro admin. Uma proração falha não deveria
    // mexer em status nenhum — só logar.
    const isProrationFailure = event.type === 'payment.failed' && event.billingReason === 'subscription_update'
    if (isProrationFailure) {
      console.warn(`[Webhook:${gateway}] Proration invoice failed for sub ${sub.id} — plan switch not applied, current plan unaffected`)
    }

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

    } else if (effectiveType === 'payment.failed' && !isProrationFailure) {
      updateData.status = 'past_due'
      updateData.updated_at = now.toISOString()
    }
    // 'subscription.plan_changed' não toca em status/período aqui —
    // app/api/checkout/route.ts já atualizou plan/price/billing_cycle/
    // current_period_end de forma síncrona quando a chamada de troca à
    // Stripe teve sucesso. Este evento é só a confirmação de que a fatura
    // de proração foi PAGA — ver bloco de entitlement abaixo.

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

      // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): a tela de
      // verificação promete "assinantes dos planos pagos com pagamento via
      // cartão de crédito aprovado ganham o selo automaticamente" — mas
      // este handler nunca tocava em profiles.verified. Hoje cartão é o
      // único método de pagamento realmente oferecido em qualquer gateway
      // (sem Pix/boleto no checkout), então toda assinatura paga aprovada
      // aqui É, na prática, via cartão. Roda como service_role, então
      // passa por guard_profile_verification sem problema.
      //
      // BUG CORRIGIDO (validação de 2026-08-26): `verified: true` rodava
      // incondicionalmente em TODA renovação (evento mensal recorrente),
      // sem checar o valor atual — se um admin revogasse o selo de um
      // assinante pago (fraude, etc.) via "Remover Selo", a próxima
      // cobrança automática desfazia isso silenciosamente. O selo agora
      // só é concedido na PRIMEIRA ativação, cumprindo a promessa
      // ("ganha o selo automaticamente" ao assinar) sem brigar com uma
      // decisão manual de moderação depois.
      const profileUpdate: Record<string, any> = {
        subscription_status: 'active',
        plan_expires_at: updateData.current_period_end || null,
      }
      if (effectiveType === 'subscription.activated') {
        profileUpdate.verified = true
        // BUG CORRIGIDO (teste de estresse full-system, 2026-08-31): grava
        // verified=true mas nunca kyc_status — a tela de verificação usa
        // 'verified' pra mensagem de sucesso, mas ProfileTab.tsx e o selo
        // dourado de AdSidebar.tsx usam 'kyc_status' pra decidir o que
        // mostrar. Sem isso, o assinante via "identidade verificada" na
        // própria tela de verificação, mas o selo no anúncio e o card do
        // painel continuavam mostrando "não enviado". Mesmo padrão que o
        // fluxo manual do admin (verify-user) já grava os dois juntos.
        profileUpdate.kyc_status = 'approved'
      }
      const { error: profErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
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

    // BUG CORRIGIDO (validação de 2026-08-26, 3ª rodada): troca nativa de
    // plano (upgrade com pro-rata) agora só concede o entitlement do plano
    // novo QUANDO a fatura de proração é confirmada paga — não mais na hora
    // em que a chamada de update à Stripe retorna 200 (isso só garante que
    // o PREÇO mudou, não que o cliente pagou a diferença). Usa
    // event.metadata.plan_id (gravado em updateSubscriptionPlan) em vez de
    // casar por nome, que é mais frágil.
    if (effectiveType === 'subscription.plan_changed') {
      // BUG CORRIGIDO (validação do zero, 4ª rodada): a Stripe não garante
      // ordem de entrega de webhook. Duas trocas de plano rápidas geram
      // duas faturas de proração pagas em sequência — se os dois eventos
      // chegarem fora de ordem, "o último PROCESSADO" (não o
      // cronologicamente mais recente) vencia, aplicando o plano ERRADO.
      // Reproduzido de forma determinística.
      //
      // BUG CORRIGIDO (validação do zero, revisão do fix acima): comparar
      // sub.plan_changed_event_created_at (lido no TOPO desta requisição)
      // e só DEPOIS escrever é um TOCTOU — duas entregas HTTP verdadeiramente
      // concorrentes pro mesmo evento podiam ler o mesmo valor antigo antes
      // de qualquer uma escrever, e a mais lenta venceria mesmo sendo mais
      // antiga. A "reivindicação" (claim) abaixo é um UPDATE ATÔMICO com a
      // condição de ordem embutida no próprio WHERE — o Postgres serializa
      // duas escritas concorrentes na mesma linha, então só uma pode
      // vencer a condição por vez.
      const eventCreatedAt = event.eventCreatedAt ?? 0
      const { data: claimed, error: claimErr } = await supabase
        .from('subscriptions')
        .update({ plan_changed_event_created_at: eventCreatedAt })
        .eq('id', sub.id)
        .or(`plan_changed_event_created_at.is.null,plan_changed_event_created_at.lt.${eventCreatedAt}`)
        .select('id, status')

      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): o
      // erro do próprio UPDATE atômico nunca era checado — se ele falhasse
      // (timeout, RLS, etc.), `claimed` vinha vazio e caía no ramo "descartar
      // por fora de ordem", que loga um warn e segue até responder 200 —
      // perdendo o evento de entitlement pra sempre em silêncio, exatamente
      // o problema que o catch externo desta rota já trata (linha ~388) mas
      // que nunca chegava até lá porque o erro era engolido aqui antes.
      if (claimErr) {
        console.error(`[Webhook:${gateway}] Falha no claim atômico de plan_changed para sub ${sub.id}:`, claimErr.message)
        // BUG CORRIGIDO (retomada da verificação independente, 2ª rodada de
        // revisão adversarial): o INSERT de idempotência (acima, "só marca
        // como processado quando já sabemos que DÁ pra processar") já tinha
        // comitado sozinho antes deste throw — cada chamada Supabase/PostgREST
        // é sua própria transação. Um reenvio real do gateway pro MESMO
        // eventId batia primeiro na checagem de duplicata do topo desta rota
        // e respondia "já processado" sem nunca tentar o claim de novo,
        // perdendo o entitlement de troca de plano pra sempre já na 1ª
        // retentativa. Apaga a linha de idempotência antes de relançar, pra
        // um retry genuíno do gateway poder reprocessar o evento do zero.
        // BUG CORRIGIDO (re-auditoria, 2026-08-30): a linha de idempotência é
        // gravada com `id = eventKey` (namespaced por gateway, ver topo desta
        // função), mas este rollback ainda apagava por `event.eventId` cru —
        // nunca encontrava a linha (DELETE sem match não gera erro), então o
        // registro "fantasma" permanecia. Um retry genuíno do gateway batia
        // na checagem de duplicata do topo, era descartado como "já
        // processado", e o entitlement da troca de plano se perdia pra
        // sempre em silêncio — exatamente o bug que este rollback existe
        // pra evitar.
        if (eventKey) {
          const { error: rollbackErr } = await supabase.from('webhook_events').delete().eq('id', eventKey)
          if (rollbackErr) console.error(`[Webhook:${gateway}] Failed to roll back idempotency row for event ${event.eventId}:`, rollbackErr.message)
        }
        throw new Error('Failed to claim plan_changed event: ' + claimErr.message)
      }

      // BUG CORRIGIDO (validação do zero, rodada 6): o claim atômico acima só
      // resolvia a ordem entre dois webhooks de plan_changed — mas não olhava
      // pro status ATUAL da assinatura. Um webhook de troca de plano atrasado
      // (ex: chegando depois de um /api/subscriptions/cancel real, entre a
      // leitura de `sub` no topo desta requisição e este ponto) reativava o
      // profiles.subscription_status pra 'active' incondicionalmente,
      // revertendo silenciosamente um cancelamento de verdade.
      //
      // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): a
      // correção acima só excluía o status 'cancelled' — qualquer OUTRO
      // status não-ativo ('past_due', 'expired', 'pending', todos valores
      // reais que subscriptions.status assume) ainda caía no `else` e
      // recebia o entitlement indevidamente (ex: um evento atrasado
      // reativando uma assinatura que já foi marcada 'past_due' por uma
      // renovação recusada, ou 'expired' pelo cron). A checagem precisa ser
      // POSITIVA (só concede se o status capturado no claim for 'active'),
      // não negativa — claimed[0].status vem do próprio UPDATE atômico,
      // então reflete o status real da linha no exato instante do claim, não
      // a leitura desatualizada de `sub`.
      const claimedStatus = claimed?.[0]?.status
      if (!claimed || claimed.length === 0) {
        console.warn(`[Webhook:${gateway}] Discarding out-of-order plan_changed event for sub ${sub.id} (event=${eventCreatedAt}, last applied=${sub.plan_changed_event_created_at})`)
      } else if (claimedStatus !== 'active') {
        console.warn(`[Webhook:${gateway}] Discarding plan_changed entitlement grant for sub ${sub.id} — status at claim time was '${claimedStatus}', not 'active'`)
      } else {
        const planId = event.metadata?.plan_id
        if (planId) {
          const { data: planRow } = await supabase.from('plans').select('id, name').eq('id', planId).maybeSingle()
          if (planRow) {
            let planEnum = 'free'
            if (planRow.name.toLowerCase().includes('premium')) planEnum = 'premium'
            else if (planRow.name.toLowerCase().includes('pro')) planEnum = 'pro'

            // BUG CORRIGIDO (validação do zero, rodada 6, revisão
            // adversarial): entre o claim atômico acima e este ponto existe
            // um round-trip extra (o SELECT em plans logo acima) — não é uma
            // transação, cada chamada Supabase/PostgREST comita sozinha.
            // Nessa janela (curta, mas real e não-zero), um cancelamento
            // genuíno concorrente podia commitar e ser revertido por esta
            // escrita incondicional, exatamente a mesma classe de bug que
            // claimedStatus já tentava fechar, só que reaberta pelo atraso
            // do round-trip. Revalida o status fresco (não o claim antigo)
            // imediatamente antes de escrever — estreita a janela ao mínimo
            // possível em vez de confiar num valor capturado alguns
            // milissegundos atrás.
            const { data: statusFresco } = await supabase
              .from('subscriptions')
              .select('status')
              .eq('id', sub.id)
              .maybeSingle()

            if (statusFresco?.status !== 'active') {
              console.warn(`[Webhook:${gateway}] Descartando concessão de entitlement de plan_changed pra sub ${sub.id} — status mudou pra '${statusFresco?.status}' entre o claim e a escrita`)
            } else {
              // BUG CORRIGIDO (validação do zero, 4ª rodada): plan_expires_at
              // nunca era tocado aqui — ficava preso na data da assinatura
              // ANTERIOR à troca. enforce_plan_expiration() (chamada em toda
              // visita a /painel) rebaixava pra Grátis um assinante pago em
              // dia assim que essa data velha vencesse. sub.current_period_end
              // já é atualizado corretamente por app/api/checkout/route.ts no
              // momento da troca (agora que o bug do campo errado da Stripe
              // também foi corrigido).
              await supabase.from('profiles').update({
                subscription_status: 'active',
                plan_expires_at: sub.current_period_end || null,
              }).eq('id', sub.user_id)
              const { error: secErr2 } = await supabase
                .from('user_secrets')
                .update({ plan: planEnum, plan_id: planRow.id })
                .eq('id', sub.user_id)
              if (secErr2) console.warn(`[Webhook:${gateway}] Could not update user_secrets on plan_changed (non-critical):`, secErr2.message)
            }
          } else {
            console.warn(`[Webhook:${gateway}] plan_changed event references unknown plan_id ${planId}`)
          }
        } else {
          console.warn(`[Webhook:${gateway}] plan_changed event without plan_id in metadata — cannot grant entitlement`)
        }
      }
    }

    if (effectiveType === 'subscription.cancelled' || (effectiveType === 'payment.failed' && !isProrationFailure)) {
      // BUG CORRIGIDO (validação adversarial final): sub é encontrado pelo
      // gateway_subscription_id do evento — no cancelamento real de uma
      // assinatura ANTIGA durante uma troca entre gateways diferentes
      // (fallback "cancela e cria nova" logo acima em checkout/route.ts),
      // esse ID nunca muda de linha, mas o usuário já pode ter uma
      // assinatura NOVA e ativa por cima. Se este webhook de cancelamento
      // chegar atrasado (comum: o gateway confirma o cancelamento de forma
      // assíncrona), o downgrade abaixo sobrescreveria o entitlement da
      // assinatura nova com 'free', mesmo o cliente pagando em dia. Descarta
      // se já existe uma assinatura mais recente pra este usuário.
      const { data: subMaisRecente } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', sub.user_id)
        .neq('id', sub.id)
        .neq('status', 'switch_applied')
        .gt('created_at', sub.created_at)
        .limit(1)
        .maybeSingle()

      if (subMaisRecente) {
        console.warn(`[Webhook:${gateway}] Descartando downgrade de ${effectiveType} pra sub ${sub.id} — usuário ${sub.user_id} já tem a assinatura mais recente ${subMaisRecente.id} (provavelmente substituída por uma troca de plano)`)
        return NextResponse.json({ received: true, handled: true, eventType: event.type })
      }

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
    // Return 400 on auth/signature/token/config errors so gateway will retry
    // Return 200 on logic errors to stop infinite retries
    //
    // BUG CORRIGIDO (validação do zero, 4ª rodada): "webhook secret not
    // configured" e "timestamp outside tolerance" não batiam em nenhum
    // padrão daqui — caíam no ramo 200 "sucesso", a Stripe nunca reenviava,
    // e o evento se perdia em silêncio pra sempre. Isso já era grave antes;
    // ficou crítico na 3ª/4ª rodada porque o entitlement de troca nativa
    // de plano passou a depender 100% deste webhook chegar de verdade.
    const isAuthError = err.message?.includes('Invalid signature') ||
      err.message?.includes('Invalid Stripe') ||
      err.message?.includes('Invalid MP') ||
      err.message?.includes('Invalid Asaas') ||
      err.message?.includes('Invalid Pagar') ||
      err.message?.includes('not configured') ||
      err.message?.includes('outside tolerance') ||
      (err.message?.includes('Missing') && err.message?.includes('signature'))
    // BUG CORRIGIDO (validação do zero, rodada 6): o default anterior pra
    // erro NÃO reconhecido era 200 — que diz pro gateway "processei com
    // sucesso, não reenvie". Qualquer erro inesperado (bug de código, timeout
    // de banco, um getSettings() falhando) caía aqui e perdia o evento de
    // billing PRA SEMPRE em silêncio, já que a Stripe nunca reenvia um evento
    // que recebeu 200. Erros reconhecidos de auth/assinatura/config continuam
    // 400 (retry); qualquer outro erro agora também pede retry (500) — só um
    // evento explicitamente "não suportado" (tratado mais acima, antes deste
    // catch) deve retornar 200 de propósito.
    const status = isAuthError ? 400 : 500
    // BUG CORRIGIDO: rota pública e sem autenticação (o gateway chama de
    // fora) devolvia err.message cru — reconhecimento de configuração
    // desnecessário (ex.: confirmar pra um atacante qual gateway está com
    // segredo vazio). A mensagem completa já foi logada no console.error
    // acima; o gateway só precisa do status HTTP pra saber se deve reenviar.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status })
  }
}
