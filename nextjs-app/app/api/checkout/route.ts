import { NextResponse } from 'next/server'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { resolverIpConfiavel } from '@/lib/ip-utils'
import {
  selectGateway,
  stripeAdapter,
  mercadoPagoAdapter,
  pagarmeAdapter,
  asaasAdapter,
  GatewayAdapter,
  GatewayPlan,
  GatewayUser,
} from '@/lib/gateways'



export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { checkoutId, planId, billingCycle, billingData, paymentMethod, creditCard, billingAddress, gatewayToken, couponCode } = body

    if (!checkoutId) {
      return NextResponse.json({ error: 'checkoutId é obrigatório' }, { status: 400 })
    }

    // Dados de cartão em claro não entram mais aqui. O CheckoutModal deixou de
    // coletá-los; esta guarda cobre cliente em cache, integração de terceiro ou
    // requisição forjada. Receber PAN/CVV colocaria a aplicação no escopo
    // PCI-DSS SAQ-D — cartão só entra tokenizado, via `gatewayToken`.
    if (creditCard) {
      console.warn('[checkout] payload com creditCard recusado — cartao deve vir tokenizado')
      return NextResponse.json(
        { error: 'Dados de cartão não são aceitos neste endpoint. Use o formulário do gateway, que devolve um token.' },
        { status: 400 }
      )
    }

    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): /api/* fica
    // de fora do rate limit de proxy.ts (só cobre /login e /auth) — esta
    // rota nunca teve nenhum freio de taxa, diferente de /api/contact-seller
    // (Upstash). Reaproveita check_rate_limit, o mesmo RPC com janela no
    // Postgres que /login já usa como rede de segurança sem Upstash.
    const { data: dentroDoLimite } = await supabase.rpc('check_rate_limit', {
      p_bucket: `checkout_${user.id}`,
      p_limit: 10,
      p_window_seconds: 60,
    })
    if (dentroDoLimite === false) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
    }

    // --- Validate inputs ---
    if (!planId) {
      return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
    }

    // --- Fetch plan (real table name: 'plans') ---
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, price, promotional_price')
      .eq('id', planId)
      .eq('is_active', true)
      .single()
    if (planError || !plan) {
      return NextResponse.json({ error: 'Plano não encontrado ou inativo' }, { status: 404 })
    }

    // --- Fetch user profile (real columns: 'name', 'country' — no full_name) ---
    const { data: profile } = await supabase
      .from('profiles')
      .select('country, name, display_name')
      .eq('id', user.id)
      .single()
    const userCountry: string | undefined = profile?.country || undefined

    // --- Fetch ALL platform settings (key-value table) ---
    const settings = await getSettings(supabase)

    const nationalDefault = settings['gateway_nacional_padrao'] || 'mercadopago'
    const internationalDefault = settings['gateway_internacional_padrao'] || 'stripe'

    // --- Select gateway based on country rule ---
    // Brasil → qualquer gateway configurado
    // Internacional → apenas Stripe ou Mercado Pago
    const gatewayName = selectGateway(userCountry, nationalDefault, internationalDefault)

    // --- Existing active subscription (read-only — a mutação real só
    // acontece depois do lock de idempotência, mais abaixo) ---
    const { data: existingActiveSub } = await supabase
      .from('subscriptions')
      .select('id, gateway, gateway_subscription_id, plan, price, billing_cycle')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // BUG CORRIGIDO (validação de 2026-08-26): só comparava plan.name —
    // trocar SÓ o ciclo de cobrança (mensal↔anual) no mesmo plano tinha
    // isPlanSwitch=false, pulava os dois blocos de troca/cancelamento
    // abaixo e caía direto no fluxo de "assinatura nova", deixando a
    // mensal antiga ativa em paralelo (risco real de cobrança dupla,
    // alcançável só via chamada direta à API, não pela UI normal — que já
    // desabilita o botão do plano atual independente do ciclo).
    const cycleForCompare: 'monthly' | 'annual' = billingCycle === 'annual' ? 'annual' : 'monthly'
    const isPlanSwitch = !!(existingActiveSub && (existingActiveSub.plan !== plan.name || existingActiveSub.billing_cycle !== cycleForCompare))

    // --- Build adapter with keys from DB ---
    let adapter: GatewayAdapter
    switch (gatewayName) {
      case 'stripe':
        if (!settings['stripe_secret_key']) {
          return NextResponse.json({ error: 'Stripe não configurado. Contate o suporte.' }, { status: 503 })
        }
        adapter = stripeAdapter(settings['stripe_secret_key'])
        break
      case 'mercadopago':
        if (!settings['mp_access_token']) {
          return NextResponse.json({ error: 'Mercado Pago não configurado. Contate o suporte.' }, { status: 503 })
        }
        adapter = mercadoPagoAdapter(settings['mp_access_token'])
        break
      case 'pagarme':
        if (!settings['pagarme_api_key']) {
          return NextResponse.json({ error: 'Pagar.me não configurado. Contate o suporte.' }, { status: 503 })
        }
        adapter = pagarmeAdapter(settings['pagarme_api_key'])
        break
      case 'asaas':
        if (!settings['asaas_api_key']) {
          return NextResponse.json({ error: 'Asaas não configurado. Contate o suporte.' }, { status: 503 })
        }
        adapter = asaasAdapter(
          settings['asaas_api_key'],
          (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'
        )
        break
      default:
        return NextResponse.json({ error: 'Gateway inválido.' }, { status: 500 })
    }

    // --- Build plan & user objects for adapter ---
    let basePrice =
      plan.promotional_price !== null && plan.promotional_price !== undefined
        ? Number(plan.promotional_price)
        : Number(plan.price)

    const cycle: 'monthly' | 'annual' = billingCycle === 'annual' ? 'annual' : 'monthly'

    if (cycle === 'annual') {
      basePrice = (basePrice * 0.8) * 12
    }

    let finalPrice = basePrice

    // Apply Coupon Logic (read-only lookup — o RPC que efetivamente
    // consome o uso do cupom só roda depois do lock de idempotência)
    let appliedCoupon: any = null
    if (couponCode) {
      const { data: couponData } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', String(couponCode).toUpperCase())
        .eq('is_active', true)
        .single()

      const valido = !!couponData &&
        (!couponData.valid_until || new Date(couponData.valid_until) >= new Date()) &&
        (!couponData.max_uses || couponData.usage_count < couponData.max_uses)

      // BUG CORRIGIDO: quando o cupom deixava de ser válido bem entre o
      // usuário aplicá-lo (checagem client-side em CheckoutModal) e o envio
      // do pagamento — ex.: outra pessoa esgotou o último uso nesse
      // intervalo —, esta rota simplesmente ignorava o cupom em silêncio e
      // cobrava o preço cheio, sem avisar. O usuário via "cupom aplicado"
      // na tela e era cobrado o valor sem desconto, sem nenhum erro.
      if (!valido) {
        return NextResponse.json({ error: 'Cupom inválido, expirado ou com limite de usos esgotado.' }, { status: 400 })
      }

      if (couponData.discount_type === 'percentage') {
        finalPrice = finalPrice * (1 - couponData.discount_value / 100)
      } else {
        finalPrice = Math.max(0, finalPrice - couponData.discount_value)
      }
      appliedCoupon = couponData
    }

    const gatewayPlan: GatewayPlan = {
      id: String(plan.id),
      name: plan.name,           // real column: 'name' (no name_pt)
      price: finalPrice,         // EXACT amount to be charged for the period
      billingCycle: cycle,
    }

    const gatewayUser: GatewayUser = {
      id: user.id,
      email: user.email!,
      // real column: 'name' (no full_name). billingData.name takes priority if provided
      name: billingData?.name || profile?.display_name || profile?.name || user.email,
      country: userCountry,
    }

    // --- Idempotency: prevent double checkout (e.g., double-click or page refresh) ---
    // Strict 15 seconds block for the EXACT SAME PLAN AND CYCLE to prevent double charges on gateway
    const fifteenSecsAgo = new Date(Date.now() - 15 * 1000).toISOString()
    const { data: existingRecent } = await supabase
      .from('subscriptions')
      .select('id, gateway_subscription_id, status, created_at')
      .eq('user_id', user.id)
      .eq('plan', plan.name)
      .eq('billing_cycle', cycle)
      .gte('created_at', fifteenSecsAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRecent) {
      return NextResponse.json({ error: 'Processamento em andamento. Aguarde alguns segundos.' }, { status: 429 })
    }

    // --- IMMEDIATE LOCK: Insert phantom subscription to block concurrent/retried clicks ---
    // BUG CORRIGIDO (validação do zero, 3ª rodada): este lock (id=checkoutId,
    // PRIMARY KEY) era inserido só depois de ~250 linhas de lógica de
    // negócio — incluindo a troca nativa de plano na Stripe e o
    // cancelamento real da assinatura anterior, ambos COM efeito colateral
    // real no gateway. Reenviar o mesmo checkoutId (retry de rede, duplo
    // clique antes do botão desabilitar, etc.) executava esse cancelamento/
    // troca de novo antes de finalmente esbarrar no 23505 do INSERT. Agora
    // o lock é adquirido ANTES de qualquer ação que mexa no gateway — uma
    // 2ª chamada com o mesmo checkoutId é barrada aqui, sem chegar perto de
    // cancelar ou trocar nada.
    const { data: phantomSub, error: insertError } = await supabase.from('subscriptions').insert({
      id: checkoutId,
      user_id: user.id,
      plan: plan.name,
      gateway: gatewayName,
      billing_cycle: cycle,
      status: 'pending',
      current_period_start: new Date().toISOString(),
      price: finalPrice,
    }).select('id').single()

    if (insertError) {
      console.error('[Checkout] Failed to create lock record (Double-Charge Blocked):', insertError.message)
      return NextResponse.json({ error: 'Processamento em andamento. Aguarde alguns segundos.' }, { status: 429 })
    }

    // --- Troca de plano com assinatura já existente ---
    //
    // Quando dá pra trocar a MESMA assinatura na Stripe (gateway atual e
    // antigo são os dois Stripe), usa o suporte nativo de proration dela —
    // é o único gateway com essa API pronta. Upgrade cobra a diferença
    // proporcional agora (proration_behavior=always_invoice), downgrade só
    // aplica o preço novo na próxima fatura, sem cobrar nem creditar nada
    // agora (proration_behavior=none) — o `prorate` abaixo é essa decisão,
    // baseada em qual preço é maior.
    //
    // Pros demais gateways (sem essa API) ou troca entre gateways
    // diferentes, cai no caminho antigo: cancela a assinatura anterior e
    // cria uma nova.
    if (isPlanSwitch && existingActiveSub!.gateway_subscription_id && existingActiveSub!.gateway === gatewayName && gatewayName === 'stripe' && adapter.updateSubscriptionPlan) {
      const prorate = finalPrice > Number(existingActiveSub!.price ?? 0)
      try {
        if (appliedCoupon) {
          const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
          if (rpcErr || success === false) {
            await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
            return NextResponse.json({ error: 'O limite de uso deste cupom acabou de ser atingido por outro usuário.' }, { status: 400 })
          }
        }

        // BUG CORRIGIDO (validação de 2026-08-26): checkoutId (UUID que o
        // CheckoutModal gera por abertura do modal) como nonce de
        // idempotência — ver comentário em lib/gateways/types.ts.
        const switchResult = await adapter.updateSubscriptionPlan(existingActiveSub!.gateway_subscription_id!, gatewayPlan, prorate, checkoutId)

        await supabase.from('subscriptions').update({
          plan: plan.name,
          price: finalPrice,
          billing_cycle: cycle,
          // BUG CORRIGIDO (validação do zero, 3ª rodada): current_period_end
          // nunca era atualizado aqui — ficava com o valor da assinatura
          // anterior à troca, o que é especialmente errado numa troca de
          // CICLO (mensal↔anual), que a Stripe realinha de verdade.
          ...(switchResult.currentPeriodEnd ? { current_period_end: switchResult.currentPeriodEnd } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', existingActiveSub!.id)

        // BUG CORRIGIDO (validação do zero, 3ª rodada): user_secrets.plan/
        // plan_id e profiles.subscription_status NÃO são mais sincronizados
        // aqui, na hora. Dois problemas do design anterior:
        //   1) Upgrade (prorate=true): a chamada de update só confirma que
        //      o PREÇO mudou na Stripe — a fatura de proração
        //      (proration_behavior=always_invoice) é cobrada de forma
        //      assíncrona e pode falhar depois (cartão recusado). O usuário
        //      ganhava o plano novo mesmo se essa cobrança falhasse, sem
        //      nenhuma reconciliação (o safety-net de payment.failed só
        //      revoga se o período já tiver vencido, o que nunca é o caso
        //      no meio do ciclo). Agora só o webhook
        //      'subscription.plan_changed' (invoice.payment_succeeded com
        //      billing_reason=subscription_update) concede o entitlement —
        //      só depois da cobrança confirmada.
        //   2) Downgrade (prorate=false): o preço só muda na PRÓXIMA
        //      fatura (promessa do FAQ), mas o entitlement (cota de
        //      anúncios, vídeo, banner, destaques) mudava JÁ — cliente
        //      perdia benefício que ainda estava pagando no ciclo atual.
        //      Como subscriptions.plan já foi atualizado acima, o entitlement
        //      novo é aplicado sozinho quando a renovação natural chegar
        //      (webhook 'subscription.renewed' já lê sub.plan em produção).
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)

        return NextResponse.json({
          success: true,
          checkoutUrl: null,
          gateway: gatewayName,
          sessionId: null,
          planSwitch: true,
          prorated: prorate,
        })
      } catch (switchErr: any) {
        if (appliedCoupon) {
          await supabase.rpc('revert_coupon_usage', { p_coupon_id: appliedCoupon.id })
        }
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
        // BUG CORRIGIDO (validação de 2026-08-26): switchErr.message tinha
        // o corpo cru da resposta de erro da Stripe concatenado direto no
        // JSON devolvido ao cliente — incluía request_log_url (link do
        // dashboard interno da Stripe) e o account ID do merchant. Loga o
        // detalhe completo só no servidor; devolve mensagem genérica.
        console.error('[Checkout] Failed to switch plan on existing subscription:', switchErr.message)
        return NextResponse.json({ error: 'Não foi possível trocar de plano no momento. Tente novamente ou contate o suporte.' }, { status: 502 })
      }
    }

    // Fallback (gateways sem update nativo, troca entre gateways
    // diferentes, ou assinatura anterior sem gateway_subscription_id —
    // ex.: ativada via cupom de 100% off): garante que a assinatura
    // anterior nunca fica ativa em paralelo à nova, cancelando-a de
    // verdade no gateway quando ela tiver uma, ou só fechando a linha
    // local quando não tiver (nada a cancelar num gateway real). Se o
    // cancelamento no gateway falhar, bloqueia a troca em vez de
    // arriscar dupla cobrança.
    if (isPlanSwitch) {
      if (!existingActiveSub!.gateway_subscription_id) {
        await supabase.from('subscriptions').update({
          status: 'cancelled',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }).eq('id', existingActiveSub!.id)
      } else {
        let oldAdapter: GatewayAdapter | null = null
        switch (existingActiveSub!.gateway) {
          case 'stripe': if (settings['stripe_secret_key']) oldAdapter = stripeAdapter(settings['stripe_secret_key']); break
          case 'mercadopago': if (settings['mp_access_token']) oldAdapter = mercadoPagoAdapter(settings['mp_access_token']); break
          case 'pagarme': if (settings['pagarme_api_key']) oldAdapter = pagarmeAdapter(settings['pagarme_api_key']); break
          case 'asaas': if (settings['asaas_api_key']) oldAdapter = asaasAdapter(settings['asaas_api_key'], (settings['asaas_environment'] as 'sandbox' | 'production') || 'sandbox'); break
        }
        if (!oldAdapter) {
          await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
          return NextResponse.json({ error: 'Não foi possível verificar sua assinatura atual. Contate o suporte antes de trocar de plano.' }, { status: 503 })
        }
        try {
          await oldAdapter.cancelSubscription(existingActiveSub!.gateway_subscription_id)
          await supabase.from('subscriptions').update({
            status: 'cancelled',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          }).eq('id', existingActiveSub!.id)
        } catch (cancelErr: any) {
          await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
          console.error('[Checkout] Failed to cancel previous subscription before plan switch:', cancelErr.message)
          return NextResponse.json({ error: 'Não foi possível migrar da assinatura atual automaticamente. Cancele-a antes de assinar outro plano, ou contate o suporte.' }, { status: 409 })
        }
      }
    }

    const paymentData = {
      method: paymentMethod || 'card',
      creditCard,
      billingAddress,
      gatewayToken,
      doc: billingData?.doc,
      phone: billingData?.phone,
      // A Asaas marca `remoteIp` como obrigatório na criação de assinatura por
      // cartão (achado de auditoria contra a doc oficial). Os demais gateways
      // ignoram este campo.
      ip: resolverIpConfiavel(req.headers),
    }

    // --- 100% OFF Bypass (Local Checkout) ---
    // Este é o ÚNICO caminho sem nenhuma chamada de gateway — não há
    // pagamento a reconciliar, então sincronizar o entitlement na hora é
    // correto (não é o mesmo risco do bug de proração corrigido acima).
    if (finalPrice <= 0) {
      if (appliedCoupon) {
        const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
        if (rpcErr || success === false) {
           await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
           return NextResponse.json({ error: 'Erro ao aplicar cupom (limite atingido ou falha interna).' }, { status: 400 })
        }
      }

      const end = new Date()
      if (cycle === 'annual') end.setFullYear(end.getFullYear() + 1)
      else end.setMonth(end.getMonth() + 1)

      await supabase.from('subscriptions').update({
        status: 'active',
        current_period_end: end.toISOString()
      }).eq('id', phantomSub.id)

      await supabase.from('profiles').update({
        subscription_status: 'active',
        plan_expires_at: end.toISOString()
      }).eq('id', user.id)

      let planEnum = 'free'
      if (plan.name.toLowerCase().includes('premium')) planEnum = 'premium'
      else if (plan.name.toLowerCase().includes('pro')) planEnum = 'pro'

      await supabase.from('user_secrets').update({
        plan: planEnum,
        plan_id: plan.id
      }).eq('id', user.id)

      return NextResponse.json({
        success: true,
        checkoutUrl: null,
        gateway: 'local',
        sessionId: null,
      })
    }

    // --- Atomic Coupon Lock Before Gateway ---
    if (appliedCoupon) {
      const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
      if (rpcErr || success === false) {
        // Rollback lock
        await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
        return NextResponse.json({ error: 'O limite de uso deste cupom acabou de ser atingido por outro usuário.' }, { status: 400 })
      }
    }

    // --- Call gateway ---
    let result
    try {
      result = await adapter.createSubscription(gatewayPlan, gatewayUser, paymentData, phantomSub.id)
    } catch (gatewayError: any) {
      // If gateway fails, remove the lock and revert coupon so user can try again immediately
      await supabase.from('subscriptions').delete().eq('id', phantomSub.id)
      if (appliedCoupon) {
        await supabase.rpc('revert_coupon_usage', { p_coupon_id: appliedCoupon.id })
      }
      // BUG CORRIGIDO (validação do zero, 3ª rodada): antes este catch dava
      // `throw gatewayError`, que caía no catch externo lá embaixo e
      // devolvia gatewayError.message CRU pro cliente — mesma classe de
      // vazamento já corrigida no bloco de troca de plano, mas nunca
      // replicada aqui (o caminho de assinatura nova). Loga o detalhe
      // completo só no servidor; devolve mensagem genérica.
      console.error('[Checkout] Gateway error creating subscription:', gatewayError.message)
      return NextResponse.json({ error: 'Não foi possível processar o pagamento no momento. Verifique os dados do cartão ou tente novamente.' }, { status: 502 })
    }

    // --- Update pending subscription with real gateway details ---
    const { error: updateError } = await supabase.from('subscriptions').update({
      gateway_subscription_id: result.gatewaySubscriptionId || result.sessionId || null,
      gateway_customer_id: result.gatewayCustomerId || null,
    }).eq('id', phantomSub.id)

    if (updateError) {
      console.error('[Checkout] Failed to update subscription with gateway details:', updateError.message)
    }

    return NextResponse.json({
      success: true,
      checkoutUrl: result.checkoutUrl || null,
      gateway: gatewayName,
      sessionId: result.sessionId || null,
    })

  } catch (err: any) {
    // BUG CORRIGIDO (validação do zero, 3ª rodada): mesmo vazamento do
    // achado acima, na rede de segurança final — não repassa err.message
    // (pode conter detalhe interno de gateway/banco) pro cliente.
    console.error('[Checkout] Error:', err)
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
