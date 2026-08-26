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

    // --- Cancela assinatura ativa existente antes de trocar de plano ---
    // BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25): não havia
    // nenhuma checagem de assinatura ativa antes de criar uma nova — um
    // "upgrade" (ou troca pra outro plano pago) podia criar uma SEGUNDA
    // assinatura ativa em paralelo à antiga, cobrando o cliente duas vezes
    // no gateway. Cancela a antiga (gateway dela, não necessariamente o
    // mesmo da nova) antes de prosseguir; se a cadência de cancelamento
    // falhar, bloqueia a troca em vez de arriscar dupla cobrança.
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

    // Apply Coupon Logic
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

    // --- Troca de plano com assinatura já existente ---
    //
    // BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25): não havia
    // nenhuma checagem de assinatura ativa antes de criar uma nova — um
    // "upgrade" (ou troca pra outro plano pago) podia criar uma SEGUNDA
    // assinatura ativa em paralelo à antiga, cobrando o cliente duas vezes
    // no gateway.
    //
    // Quando dá pra trocar a MESMA assinatura na Stripe (gateway atual e
    // antigo são os dois Stripe), usa o suporte nativo de proration dela —
    // é o único gateway com essa API pronta. Isso resolve as duas
    // promessas do FAQ de /planos de uma vez: upgrade cobra a diferença
    // proporcional agora (proration_behavior=always_invoice), downgrade só
    // aplica o preço novo na próxima fatura, sem cobrar nem creditar nada
    // agora (proration_behavior=none) — o `prorate` abaixo é essa decisão,
    // baseada em qual preço é maior.
    //
    // Pros demais gateways (sem essa API) ou troca entre gateways
    // diferentes, cai no caminho antigo: cancela a assinatura anterior e
    // cria uma nova — cobrança imediata do valor cheio do plano novo, sem
    // pro-rata nem agendamento (limitação conhecida, documentada no
    // checklist).
    if (isPlanSwitch && existingActiveSub!.gateway_subscription_id && existingActiveSub!.gateway === gatewayName && gatewayName === 'stripe' && adapter.updateSubscriptionPlan) {
      const prorate = finalPrice > Number(existingActiveSub!.price ?? 0)
      try {
        if (appliedCoupon) {
          const { data: success, error: rpcErr } = await supabase.rpc('try_apply_coupon', { p_coupon_id: appliedCoupon.id })
          if (rpcErr || success === false) {
            return NextResponse.json({ error: 'O limite de uso deste cupom acabou de ser atingido por outro usuário.' }, { status: 400 })
          }
        }

        // BUG CORRIGIDO (validação de 2026-08-26): checkoutId (UUID que o
        // CheckoutModal gera por abertura do modal) como nonce de
        // idempotência — ver comentário em lib/gateways/types.ts.
        await adapter.updateSubscriptionPlan(existingActiveSub!.gateway_subscription_id!, gatewayPlan, prorate, checkoutId)

        await supabase.from('subscriptions').update({
          plan: plan.name,
          price: finalPrice,
          billing_cycle: cycle,
          updated_at: new Date().toISOString(),
        }).eq('id', existingActiveSub!.id)

        // BUG CORRIGIDO (validação de 2026-08-26): a troca nativa nunca
        // sincronizava user_secrets.plan_id/profiles — são exatamente as
        // colunas que enforce_ad_quota/enforce_ad_media_plan_limits/
        // guard_ad_featured leem para aplicar cota/fotos/destaques. Sem
        // isso, quem pagava um upgrade continuava com os limites do plano
        // antigo até a próxima renovação natural (semanas/meses depois).
        // Feito aqui, direto, em vez de depender do webhook: já sabemos
        // com certeza que a troca deu certo (chegamos aqui só se
        // updateSubscriptionPlan não lançou), e a Stripe rotula a fatura
        // de proração gerada como billing_reason=subscription_update, um
        // valor que o webhook não tem por que aprender só para replicar
        // uma sincronização que o próprio checkout já pode fazer na hora.
        let planEnum = 'free'
        if (plan.name.toLowerCase().includes('premium')) planEnum = 'premium'
        else if (plan.name.toLowerCase().includes('pro')) planEnum = 'pro'

        await supabase.from('profiles').update({ subscription_status: 'active' }).eq('id', user.id)
        await supabase.from('user_secrets').update({ plan: planEnum, plan_id: plan.id }).eq('id', user.id)

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
    //
    // BUG CORRIGIDO (validação de 2026-08-26): antes exigia
    // gateway_subscription_id truthy pra entrar neste bloco — uma
    // assinatura 100%-off (cupom) fica 'active' com esse campo NULL
    // (nunca chama gateway nenhum), então nunca era cancelada aqui; quem
    // pagava de verdade depois ficava com 2 assinaturas 'active'
    // simultâneas (a de cupom nunca fechada + a nova).
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
          console.error('[Checkout] Failed to cancel previous subscription before plan switch:', cancelErr.message)
          return NextResponse.json({ error: 'Não foi possível migrar da assinatura atual automaticamente. Cancele-a antes de assinar outro plano, ou contate o suporte.' }, { status: 409 })
        }
      }
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

    // --- IMMEDIATE LOCK: Insert phantom subscription to block concurrent clicks ---
    // The 'id' (checkoutId) is a PRIMARY KEY. If 3 concurrent requests hit this, 2 will fail with 23505 Unique Violation!
    const { data: phantomSub, error: insertError } = await supabase.from('subscriptions').insert({
      id: checkoutId,
      user_id: user.id,
      plan: plan.name,
      gateway: gatewayName,
      billing_cycle: cycle,
      status: 'pending',
      current_period_start: new Date().toISOString(),
      // BUG CORRIGIDO: 'price' nunca era gravado em lugar nenhum desta rota —
      // toda assinatura ficava com price NULL para sempre, mesmo cobrando de
      // verdade no gateway. Resultado real: admin/assinaturas sempre mostrava
      // "R$ 0,00" de valor e de MRR, não importa quantas assinaturas pagas
      // existissem. finalPrice já está calculado (com cupom aplicado) antes
      // deste insert, então é só gravar o valor exato que será cobrado.
      price: finalPrice,
    }).select('id').single()

    if (insertError) {
      console.error('[Checkout] Failed to create lock record (Double-Charge Blocked):', insertError.message)
      return NextResponse.json({ error: 'Processamento em andamento. Aguarde alguns segundos.' }, { status: 429 })
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
      throw gatewayError
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
    console.error('[Checkout] Error:', err)
    return NextResponse.json({ error: err.message || 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
