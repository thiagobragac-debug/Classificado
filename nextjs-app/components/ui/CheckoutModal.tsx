'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useLang } from '@/lib/lang-context'
import type { Lang } from '@/lib/constants'
import { getCurrencySymbol as sharedGetCurrencySymbol, formatCurrencyAmount } from '@/lib/currency'

import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react'

// BUG CORRIGIDO (validação de 2026-08-26): o tipo tinha 'pix'/'boleto',
// e existia um METHOD_LABELS (⚡ PIX / 🧾 Boleto) nunca renderizado em
// lugar nenhum — nenhum dos 4 gateways aceita esses métodos
// (TOKENIZED_GATEWAYS abaixo só cobre cartão), e não há setter pra
// paymentMethod mudar de 'card'. Código morto de uma seleção de método
// que nunca chegou a existir na UI — removido, junto do FAQ que prometia
// Pix/boleto em /planos.
type PaymentMethod = 'card'

// Strings deste modal não existem no dicionário global I18N (lib/constants.ts)
// — seguem o mesmo padrão local já usado em components/ads/AdsSidebar.tsx em
// vez de poluir o dicionário compartilhado.
const TRANSLATIONS = {
  pt: {
    title: 'Pagamento Seguro',
    close: 'Fechar',
    planPrefix: 'Plano',
    annualSuffix: '(Anual)',
    perMonth: '/mês',
    perYear: '/ano',
    couponQuestion: 'Possui cupom de desconto?',
    couponPlaceholder: 'Código do cupom',
    couponApply: 'Aplicar',
    couponApplying: '...',
    couponAppliedPrefix: '✅ Cupom',
    couponAppliedSuffix: 'aplicado!',
    couponDiscount: 'Desconto de',
    couponRemove: 'Remover',
    couponInvalid: 'Cupom inválido ou inativo.',
    couponError: 'Erro ao validar cupom.',
    couponNotApplicableCurrency: 'Este cupom não se aplica a cobranças em dólar — o preço final não terá desconto.',
    billingIntro: 'Precisamos de alguns dados extras para emitir sua fatura.',
    fullName: 'Nome Completo',
    doc: 'CPF/CNPJ',
    phone: 'Celular',
    billingAddress: 'Endereço de Cobrança',
    cep: 'CEP',
    street: 'Rua',
    number: 'Número',
    neighborhood: 'Bairro',
    city: 'Cidade',
    state: 'Estado (UF)',
    continueToPayment: 'Continuar para Pagamento',
    initializing: 'Inicializando Seguro...',
    cardOption: '💳 Cartão de Crédito',
    cardUnavailableTitle: 'Cartão indisponível no momento',
    cardUnavailableBody: 'O meio de pagamento configurado não aceita cartão por aqui. Fale com o suporte para concluir a assinatura.',
    cardHolderName: 'Nome no Cartão',
    cardNumber: 'Número do Cartão',
    cardExpiry: 'Validade (MM/AA)',
    cardCvv: 'CVV',
    payWithCard: 'Pagar com Cartão →',
    tokenizingCard: 'Processando cartão...',
    errCardIncomplete: 'Preencha todos os dados do cartão.',
    goToCheckout: 'Ir para o Checkout Seguro →',
    processing: 'Processando...',
    back: '← Voltar',
    sslBadge: '🔒 SSL',
    pciBadge: '🛡️ PCI-DSS',
    secureBadge: '✅ Compra Segura',
    errDocInvalid: 'CPF ou CNPJ inválido. Digite 11 ou 14 números.',
    errPhoneInvalid: 'Telefone inválido. Inclua o DDD (ex: 11999999999).',
    errNotLoggedIn: 'Você precisa estar logado para assinar um plano.',
    errCheckoutInit: 'Erro ao iniciar o checkout.',
    errSubscriptionFail: 'Falha ao processar assinatura.',
    errUnexpected: 'Erro inesperado. Tente novamente.',
    errCardUnavailable: 'Pagamento por cartão indisponível para este gateway. Fale com o suporte.',
    stripeCardError: 'Erro ao validar cartão no Stripe.',
    stripeUnexpected: 'Erro inesperado no Stripe.',
    stripeProcessing: 'Processando Stripe...',
    stripePayButton: 'Pagar com Stripe →',
    confirmSwitchTitle: 'Confirmar Troca de Plano',
    confirmSwitchDesc: 'Sua forma de pagamento atual já está cadastrada — não é preciso informar cartão ou endereço de novo pra trocar de plano.',
    confirmSwitchBtn: 'Confirmar Troca',
    checkingSwitch: 'Verificando sua assinatura...',
  },
  es: {
    title: 'Pago Seguro',
    close: 'Cerrar',
    planPrefix: 'Plan',
    annualSuffix: '(Anual)',
    perMonth: '/mes',
    perYear: '/año',
    couponQuestion: '¿Tienes un cupón de descuento?',
    couponPlaceholder: 'Código del cupón',
    couponApply: 'Aplicar',
    couponApplying: '...',
    couponAppliedPrefix: '✅ Cupón',
    couponAppliedSuffix: 'aplicado!',
    couponDiscount: 'Descuento de',
    couponRemove: 'Quitar',
    couponInvalid: 'Cupón inválido o inactivo.',
    couponError: 'Error al validar el cupón.',
    couponNotApplicableCurrency: 'Este cupón no se aplica a cobros en dólares — el precio final no tendrá descuento.',
    billingIntro: 'Necesitamos algunos datos adicionales para emitir tu factura.',
    fullName: 'Nombre Completo',
    doc: 'CPF/CNPJ',
    phone: 'Celular',
    billingAddress: 'Dirección de Facturación',
    cep: 'CEP',
    street: 'Calle',
    number: 'Número',
    neighborhood: 'Barrio',
    city: 'Ciudad',
    state: 'Estado (UF)',
    continueToPayment: 'Continuar al Pago',
    initializing: 'Inicializando Seguro...',
    cardOption: '💳 Tarjeta de Crédito',
    cardUnavailableTitle: 'Tarjeta no disponible en este momento',
    cardUnavailableBody: 'El medio de pago configurado no acepta tarjeta aquí. Habla con soporte para completar la suscripción.',
    cardHolderName: 'Nombre en la Tarjeta',
    cardNumber: 'Número de la Tarjeta',
    cardExpiry: 'Validez (MM/AA)',
    cardCvv: 'CVV',
    payWithCard: 'Pagar con Tarjeta →',
    tokenizingCard: 'Procesando tarjeta...',
    errCardIncomplete: 'Completa todos los datos de la tarjeta.',
    goToCheckout: 'Ir al Checkout Seguro →',
    processing: 'Procesando...',
    back: '← Volver',
    sslBadge: '🔒 SSL',
    pciBadge: '🛡️ PCI-DSS',
    secureBadge: '✅ Compra Segura',
    errDocInvalid: 'CPF o CNPJ inválido. Ingresa 11 o 14 números.',
    errPhoneInvalid: 'Teléfono inválido. Incluye el código de área (ej: 11999999999).',
    errNotLoggedIn: 'Debes iniciar sesión para suscribirte a un plan.',
    errCheckoutInit: 'Error al iniciar el checkout.',
    errSubscriptionFail: 'Error al procesar la suscripción.',
    errUnexpected: 'Error inesperado. Inténtalo de nuevo.',
    errCardUnavailable: 'Pago con tarjeta no disponible para este gateway. Habla con soporte.',
    stripeCardError: 'Error al validar la tarjeta en Stripe.',
    stripeUnexpected: 'Error inesperado en Stripe.',
    stripeProcessing: 'Procesando Stripe...',
    stripePayButton: 'Pagar con Stripe →',
    confirmSwitchTitle: 'Confirmar Cambio de Plan',
    confirmSwitchDesc: 'Tu forma de pago actual ya está registrada — no hace falta ingresar tarjeta ni dirección de nuevo para cambiar de plan.',
    confirmSwitchBtn: 'Confirmar Cambio',
    checkingSwitch: 'Verificando tu suscripción...',
  },
} as const

// GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): "R$" estava
// hardcoded em 4 lugares deste modal, enquanto os cards de /planos (fora
// deste modal) já mostravam plan.currency dinamicamente. Sem efeito prático
// hoje (plans.currency é sempre 'BRL' em produção), mas se um dia um plano
// for cadastrado em outra moeda, o valor cobrado mostrado aqui ficaria
// errado silenciosamente.
//
// BUG CORRIGIDO (validação do zero, rodada 6): a "correção" de 2026-08-26/27
// trocou o mapa estático de símbolos por Intl.NumberFormat variando o locale
// por idioma — mas símbolo de moeda não é tradução (R$ continua R$ pra quem
// vê a página em espanhol). es-AR não tem símbolo de BRL no CLDR, então o
// Intl caía pro código ISO cru ("BRL 160.000,00" em vez de "R$ 160.000,00").
// getCurrencySymbol/formatCurrencyAmount (lib/currency.ts) fazem a separação
// certa: símbolo vem de mapa fixo, só o NÚMERO (separador decimal/milhar)
// varia por idioma via Intl.
const getCurrencySymbol = (currency: string) => sharedGetCurrencySymbol(currency)
const formatAmount = (amount: number, lang: Lang) => formatCurrencyAmount(amount, lang)

// Gateways que tokenizam o cartão no browser, com o próprio SDK do provedor
// (iframe do Stripe Elements / Brick do MP) — nosso servidor nunca vê número
// nem CVV pra estes dois.
//
// Pagar.me e Asaas ficam de fora desta lista de propósito: nenhum dos dois
// tem um SDK com iframe pronto — cada um usa seu próprio formulário HTML
// simples mais abaixo (blocos `gatewayConfig?.gateway === 'pagarme'` /
// `=== 'asaas'`), tratado à parte tanto no aviso de "indisponível" quanto no
// botão padrão escondido logo abaixo desta constante.
//
// Diferença entre os dois: Asaas NÃO tem tokenização client-side (a chamada
// exige a access_token secreta, que não pode ir pro browser) — o cartão
// passa em claro só até /api/checkout/tokenize-card, a ÚNICA rota que recebe
// PAN/CVV, e só repassa à Asaas, nunca grava nem loga. Pagar.me tokeniza com
// a public_key (pagarme_pub_key), então o POST vai DIRETO do navegador pra
// api.pagar.me/core/v5/tokens (ver handlePagarmeCardSubmit) — nosso servidor
// nunca vê PAN/CVV nesse caminho, igual Stripe/MP.
const TOKENIZED_GATEWAYS = ['stripe', 'mercadopago']
const CUSTOM_FORM_GATEWAYS = ['pagarme', 'asaas']

export default function CheckoutModal({ plan, billingCycle = 'monthly', onClose }: { plan: any, billingCycle?: 'monthly' | 'annual', onClose: () => void }) {
  const { session } = useAuth()
  const router = useRouter()
  const { lang } = useLang()
  const t = TRANSLATIONS[lang]
  const [step, setStep] = useState(1)
  const [paymentMethod] = useState<PaymentMethod>('card')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gatewayConfig, setGatewayConfig] = useState<{ gateway: string, publicKey: string, clientSecret?: string, currency?: string, unitPrice?: number | null } | null>(null)
  const [stripePromise, setStripePromise] = useState<any>(null)
  // BUG CORRIGIDO (feature aprovada pelo usuário): trocar entre dois planos
  // PAGOS (ex. Pro→Premium) mandava o usuário preencher endereço/dados de
  // cobrança e às vezes até cartão de novo — dados que o caminho nativo de
  // troca (updateSubscriptionPlan, que opera na assinatura já existente no
  // gateway) simplesmente descarta, nunca usa. `/api/checkout/init` agora
  // prevê isso ANTES do formulário aparecer (mesma condição exata que
  // /api/checkout aplica de verdade — ver isNativePlanSwitchEligible em
  // lib/gateways/index.ts), então o check acontece no mount do modal, não
  // no submit do Step 1.
  const [initializing, setInitializing] = useState(true)
  const [isNativePlanSwitch, setIsNativePlanSwitch] = useState(false)

  // Billing data (step 1)
  const [name, setName] = useState(session?.user?.user_metadata?.full_name || '')
  const [doc, setDoc] = useState('')
  const [phone, setPhone] = useState('')

  // Billing Address
  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')

  // Cartão da Asaas (step 2, só quando gatewayConfig.gateway === 'asaas') —
  // fica isolado do resto do state de billing acima de propósito: vai
  // direto pro fetch de /api/checkout/tokenize-card em handleAsaasCardSubmit,
  // nunca entra no payload de /api/checkout (ver TOKENIZED_GATEWAYS).
  const [cardHolderName, setCardHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpMonth, setCardExpMonth] = useState('')
  const [cardExpYear, setCardExpYear] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [tokenizing, setTokenizing] = useState(false)

  // Coupons
  const [couponCode, setCouponCode] = useState('')
  const [coupon, setCoupon] = useState<any>(null)
  const [couponError, setCouponError] = useState('')
  const [loadingCoupon, setLoadingCoupon] = useState(false)

  // Nome do plano localizado — mesmo padrão de fallback já usado em `ads`
  // (lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt).
  const planName = (lang === 'es' && plan.name_es) ? plan.name_es : (plan.name_pt || plan.name)

  // --- Price calculation ---
  // BUG CORRIGIDO (achado ao vivo, 2026-09-01): sempre calculava a partir de
  // `plan.price`/`plan.currency` (a prop vinda de PricingClientUI, sempre
  // BRL) — pra um usuário internacional que a Stripe vai cobrar em USD
  // (plans.price_usd, ver /api/checkout/route.ts), a tela mostrava "R$79,00"
  // mas cobrava US$X. gatewayConfig.unitPrice/currency (devolvidos por
  // /api/checkout/init, mesma fonte que decide a cobrança real) têm
  // prioridade assim que carregam; a prop do plano continua sendo o
  // fallback só enquanto `initializing` (evita a tela em branco/zero).
  const hasResolvedPrice = gatewayConfig?.unitPrice !== null && gatewayConfig?.unitPrice !== undefined
  let basePrice = hasResolvedPrice
    ? Number(gatewayConfig!.unitPrice)
    : ((plan.promotional_price !== null && plan.promotional_price !== undefined)
        ? Number(plan.promotional_price)
        : Number(plan.price))
  if (billingCycle === 'annual') {
    basePrice = (basePrice * 0.8) * 12
  }
  const displayCurrency = hasResolvedPrice ? (gatewayConfig!.currency || 'BRL') : (plan.currency || 'BRL')
  // BUG CORRIGIDO (RESOLVER PROBLEMA CUPOM): cupom de valor fixo é
  // cadastrado em BRL por padrão, com um equivalente em USD opcional
  // (coupons.discount_value_usd, ver migration 20260901130000 e mesmo guard
  // em app/api/checkout/route.ts) — sem esse equivalente, o cupom fixo não
  // se aplica a uma cobrança em USD. `couponInapplicable` diferencia esse
  // caso de "sem cupom" pra avisar o usuário em vez de mostrar "cupom
  // aplicado" cobrando o preço cheio, como acontecia antes.
  const couponFixedUsdAmount = coupon?.discount_value_usd !== null && coupon?.discount_value_usd !== undefined ? Number(coupon.discount_value_usd) : null
  const couponInapplicable = !!coupon && coupon.discount_type === 'fixed' && displayCurrency !== 'BRL' && couponFixedUsdAmount === null
  const finalPrice = coupon
    ? (coupon.discount_type === 'percentage'
        ? Math.max(0, basePrice * (1 - coupon.discount_value / 100))
        : (displayCurrency === 'BRL'
            ? Math.max(0, basePrice - coupon.discount_value)
            : (couponFixedUsdAmount !== null ? Math.max(0, basePrice - couponFixedUsdAmount) : basePrice)))
    : basePrice
  const currencySymbol = getCurrencySymbol(displayCurrency)

  // --- Idempotency nonce ---
  // BUG CORRIGIDO (validação do zero, 3ª rodada): antes era gerado dentro
  // do efeito que reage a `gatewayConfig`, que muda de referência sempre
  // que handleBillingSubmit roda de novo — inclusive num "← Voltar" +
  // reenviar dentro da MESMA sessão de checkout. Isso trocava o nonce de
  // idempotência no meio de um retry genuíno (ex.: resposta do servidor
  // perdida por timeout após já ter tido sucesso), abrindo uma janela
  // estreita pra aplicar a mesma troca de plano/proração duas vezes. Um
  // checkoutId por ABERTURA do modal (gerado uma vez, na montagem) é o
  // nonce certo — mesmo valor em qualquer retry dentro da mesma tentativa,
  // valor novo só quando o modal reabre de verdade.
  const [checkoutId] = useState(() => crypto.randomUUID())

  // --- Checa de saída se esta troca vai cair no caminho nativo (sem
  // recoletar cartão/endereço) — precisa acontecer ANTES do usuário ver o
  // Step 1, não no submit dele, senão o formulário já teria aparecido. ---
  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false
    setInitializing(true)
    fetch('/api/checkout/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ planId: plan.id, billingCycle }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (ok) {
          setGatewayConfig(data)
          setIsNativePlanSwitch(!!data.isNativePlanSwitch)
        } else {
          setError(data.error || t.errCheckoutInit)
        }
      })
      .catch(() => { if (!cancelled) setError(t.errUnexpected) })
      .finally(() => { if (!cancelled) setInitializing(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

  // --- Initialize Gateway SDK ---
  useEffect(() => {
    if (gatewayConfig?.gateway === 'stripe' && gatewayConfig.publicKey) {
      setStripePromise(loadStripe(gatewayConfig.publicKey))
    } else if (gatewayConfig?.gateway === 'mercadopago' && gatewayConfig.publicKey) {
      // GAP CORRIGIDO (auditoria completa de i18n, 2026-08-26/27): locale do
      // Brick do Mercado Pago vinha fixo em 'pt-BR' mesmo com tc_lang=es. O
      // SDK (@mercadopago/sdk-react) só aceita um conjunto fechado de
      // variantes regionais — es-AR é a mais comum pro público platino
      // (Argentina/Uruguai/Paraguai), mesma convenção já usada em
      // components/ads/AdCard.tsx pra Intl.NumberFormat/toLocaleDateString.
      initMercadoPago(gatewayConfig.publicKey, { locale: lang === 'es' ? 'es-AR' : 'pt-BR' })
    }
  }, [gatewayConfig, lang])

  // --- Coupon ---
  // BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25): lia a tabela
  // `coupons` direto com a anon key — parou de ser possível quando a RLS
  // virou admin-only (a policy antiga permitia qualquer autenticado
  // listar/criar cupom, inclusive de 100% off). O preview agora passa por
  // uma rota de servidor que faz a mesma checagem sem expor a tabela.
  const handleApplyCoupon = async () => {
    if (!couponCode) return
    setLoadingCoupon(true)
    setCouponError('')
    try {
      const res = await fetch('/api/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode }),
      })
      const data = await res.json()
      if (!data.valid) {
        setCouponError(data.error || t.couponInvalid)
        setCoupon(null)
      } else {
        setCoupon({ code: couponCode.toUpperCase(), discount_type: data.discount_type, discount_value: data.discount_value, discount_value_usd: data.discount_value_usd })
      }
    } catch {
      setCouponError(t.couponError)
      setCoupon(null)
    }
    setLoadingCoupon(false)
  }

  // --- Step 1: billing data ---
  // BUG CORRIGIDO (feature aprovada pelo usuário): chamava /api/checkout/init
  // aqui, no submit — agora essa chamada acontece no mount do modal (ver
  // useEffect acima), porque a decisão de MOSTRAR este formulário ou não já
  // depende do resultado dela (isNativePlanSwitch). Aqui só valida e avança.
  const handleBillingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!gatewayConfig) {
      setError(t.errCheckoutInit)
      return
    }
    setStep(2)
  }

  // --- Step 2: Unified checkout API caller ---
  const handleServerCheckout = async (paymentData: any) => {
    if (!session?.access_token) {
      setError(t.errNotLoggedIn)
      return
    }
    setLoading(true)
    setError('')
    try {
      // BUG CORRIGIDO (feature aprovada pelo usuário): doc/phone/endereço
      // nunca são preenchidos na troca nativa entre planos pagos (o
      // formulário de cobrança é pulado de propósito — ver isNativePlanSwitch
      // acima) — validar como se fossem obrigatórios aqui travava a única
      // ação disponível nessa tela com "CPF ou CNPJ inválido" sempre.
      // /api/checkout já trata billingData/billingAddress como opcionais
      // (só usados pra criar uma assinatura NOVA, não pro caminho nativo).
      let docClean = ''
      let phoneClean = ''
      let billingAddress: Record<string, string> | undefined
      if (!isNativePlanSwitch) {
        docClean = doc.replace(/\D/g, '')
        if (docClean.length !== 11 && docClean.length !== 14) {
          throw new Error(t.errDocInvalid)
        }

        phoneClean = phone.replace(/\D/g, '')
        if (phoneClean.length < 10) {
          throw new Error(t.errPhoneInvalid)
        }

        billingAddress = {
          cep: cep.replace(/\D/g, ''),
          street,
          number: addressNumber,
          neighborhood,
          city,
          state
        }
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          checkoutId,
          planId: plan.id,
          billingCycle,
          paymentMethod,
          couponCode: coupon?.code || null,
          finalPrice,
          billingData: isNativePlanSwitch ? undefined : { name, doc: docClean, phone: phoneClean },
          billingAddress,
          ...paymentData
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t.errCheckoutInit)
      }

      if (data.success) {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        } else {
          window.location.href = '/painel?subscribed=1'
        }
      } else {
        throw new Error(t.errSubscriptionFail)
      }
    } catch (err: any) {
      setError(err.message || t.errUnexpected)
    } finally {
      setLoading(false)
    }
  }

  // Asaas: única gateway sem tokenização client-side (ver comentário em
  // TOKENIZED_GATEWAYS) — o cartão passa em claro só até
  // /api/checkout/tokenize-card, que devolve um token opaco e nunca
  // grava/loga PAN/CVV. Daqui em diante segue o mesmo caminho de
  // Stripe/MP: só o token chega em handleServerCheckout, nunca o cartão.
  const handleAsaasCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.access_token) {
      setError(t.errNotLoggedIn)
      return
    }
    if (!cardHolderName || !cardNumber || !cardExpMonth || !cardExpYear || !cardCvv) {
      setError(t.errCardIncomplete)
      return
    }
    setTokenizing(true)
    setError('')
    try {
      const res = await fetch('/api/checkout/tokenize-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          creditCard: {
            holderName: cardHolderName,
            number: cardNumber.replace(/\s/g, ''),
            expMonth: cardExpMonth,
            expYear: cardExpYear,
            cvv: cardCvv,
          },
          billingAddress: {
            cep: cep.replace(/\D/g, ''),
            street,
            number: addressNumber,
            neighborhood,
            city,
            state,
          },
          doc: doc.replace(/\D/g, ''),
          phone: phone.replace(/\D/g, ''),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.errCheckoutInit)
      }
      await handleServerCheckout({ gatewayToken: data.token })
    } catch (err: any) {
      setError(err.message || t.errUnexpected)
    } finally {
      setTokenizing(false)
    }
  }

  // Pagar.me: tokeniza DIRETO contra a API deles (só a public_key,
  // pagarme_pub_key em gatewayConfig.publicKey — mesmo par pub/secret do
  // fluxo já validado ao vivo em lib/gateways/pagarme.ts::createSubscription).
  // Igual ao Stripe/MP, nenhum dado de cartão passa pelo nosso servidor.
  const handlePagarmeCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gatewayConfig?.publicKey) {
      setError(t.errCheckoutInit)
      return
    }
    if (!cardHolderName || !cardNumber || !cardExpMonth || !cardExpYear || !cardCvv) {
      setError(t.errCardIncomplete)
      return
    }
    setTokenizing(true)
    setError('')
    try {
      const tokRes = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${gatewayConfig.publicKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'card',
          card: {
            number: cardNumber.replace(/\s/g, ''),
            holder_name: cardHolderName,
            exp_month: parseInt(cardExpMonth, 10),
            exp_year: parseInt(cardExpYear, 10),
            cvv: cardCvv,
          },
        }),
      })
      const tokData = await tokRes.json()
      if (!tokRes.ok || !tokData.id) {
        throw new Error(tokData.message || t.stripeCardError)
      }
      await handleServerCheckout({ gatewayToken: tokData.id })
    } catch (err: any) {
      setError(err.message || t.errUnexpected)
    } finally {
      setTokenizing(false)
    }
  }

  // BUG CORRIGIDO (validação do zero, 3ª rodada): o Brick de cartão do
  // Mercado Pago (CardPayment) recebia `initialization`/`onSubmit` como
  // literais inline — recriados em TODA re-renderização do modal. O SDK
  // (@mercadopago/sdk-react) usa esses props como dependência de efeito
  // por IDENTIDADE: uma re-renderização enquanto o Brick ainda está
  // inicializando (initBrick é assíncrono) podia disparar duas chamadas a
  // create() pro mesmo container, produzindo "Bricks.create: initialization
  // failed" de forma repetida — reproduzido de forma independente por 2
  // rodadas de validação. handleServerCheckout muda de identidade a cada
  // render (fecha sobre vários estados do formulário), então o callback do
  // Brick usa uma ref pra sempre chamar a versão mais recente sem forçar
  // o Brick a remontar.
  const handleServerCheckoutRef = useRef(handleServerCheckout)
  handleServerCheckoutRef.current = handleServerCheckout

  const mpInitialization = useMemo(
    () => ({ amount: finalPrice, payer: { email: session?.user?.email } }),
    [finalPrice, session?.user?.email]
  )

  const handleMpSubmit = useCallback(async (formData: any) => {
    await handleServerCheckoutRef.current({ gatewayToken: formData.token })
  }, [])

  // Submissão para os métodos que não têm UI própria do gateway (PIX, Boleto).
  // Cartão em Stripe/Mercado Pago é enviado pelos componentes deles, que
  // devolvem um token — nenhum dado de cartão passa por aqui.
  const handleNativeCheckout = () => {
    if (paymentMethod === 'card' && !TOKENIZED_GATEWAYS.includes(gatewayConfig?.gateway || '') && !CUSTOM_FORM_GATEWAYS.includes(gatewayConfig?.gateway || '')) {
      setError(t.errCardUnavailable)
      return
    }
    if (paymentMethod === 'card') {
      // UI conduzida pelo Elements (Stripe) ou pelo Brick (Mercado Pago)
      return
    }
    handleServerCheckout({})
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#ffffff', width: '100%', maxWidth: '500px',
        borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', color: '#1e293b',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem 2rem', borderBottom: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1
        }}>
          <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💳</span> {t.title}
          </h3>
          <button onClick={onClose} disabled={loading} aria-label={t.close} style={{
            background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748b',
            cursor: loading ? 'not-allowed' : 'pointer', width: '32px', height: '32px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
            opacity: loading ? 0.4 : 1
          }}>&times;</button>
        </div>

        <div style={{ padding: '2rem' }}>
          {/* Plan summary */}
          <div style={{
            background: '#f1f5f9', padding: '1rem 1.5rem', borderRadius: '12px',
            marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1.1rem' }}>
              {t.planPrefix} {planName} {billingCycle === 'annual' && <span style={{ fontSize: '0.8em', color: '#10b981' }}>{t.annualSuffix}</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              {coupon && !couponInapplicable ? (
                <>
                  <div style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.9rem' }}>
                    {currencySymbol} {formatAmount(basePrice, lang)} {billingCycle === 'annual' ? t.perYear : t.perMonth}
                  </div>
                  <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>
                    {currencySymbol} {formatAmount(finalPrice, lang)} {billingCycle === 'annual' ? t.perYear : t.perMonth}
                  </div>
                </>
              ) : (
                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>
                  {currencySymbol} {formatAmount(finalPrice, lang)} {billingCycle === 'annual' ? t.perYear : t.perMonth}
                </div>
              )}
            </div>
          </div>

          {/* Coupon (step 1 normal, ou na confirmação de troca nativa) */}
          {!initializing && (isNativePlanSwitch || step === 1) && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
              {!coupon ? (
                <>
                  <label htmlFor="coupon" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    {t.couponQuestion}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      id="coupon" type="text" value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (!loadingCoupon && couponCode) handleApplyCoupon()
                        }
                      }}
                      placeholder={t.couponPlaceholder}
                      style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px' }}
                    />
                    <button type="button" onClick={handleApplyCoupon} disabled={loadingCoupon || !couponCode}
                      style={{ padding: '0 16px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                      {loadingCoupon ? t.couponApplying : t.couponApply}
                    </button>
                  </div>
                  {couponError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px' }}>{couponError}</p>}
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>{t.couponAppliedPrefix} {coupon.code} {t.couponAppliedSuffix}</div>
                    {/* BUG CORRIGIDO (RESOLVER PROBLEMA CUPOM): antes sempre
                        mostrava o valor cadastrado em R$ mesmo quando a
                        cobrança é USD e o cupom fixo não tem equivalente em
                        dólar — "cupom aplicado" com um desconto que não era
                        de fato descontado do preço final. */}
                    {couponInapplicable ? (
                      <div style={{ fontSize: '0.8rem', color: '#f59e0b' }}>{t.couponNotApplicableCurrency}</div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {t.couponDiscount} {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `${currencySymbol} ${formatAmount(displayCurrency === 'BRL' ? coupon.discount_value : (couponFixedUsdAmount ?? coupon.discount_value), lang)}`}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setCoupon(null); setCouponCode('') }}
                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}>
                    {t.couponRemove}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Verificação inicial (prevê se esta troca vai cair no caminho
              nativo, antes de decidir mostrar o formulário de cobrança) */}
          {initializing ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b' }}>{t.checkingSwitch}</div>
          ) : isNativePlanSwitch ? (
            /* Troca nativa entre dois planos pagos: a forma de pagamento já
               cadastrada na assinatura atual é reaproveitada de verdade
               (updateSubscriptionPlan) — nem cartão nem endereço são
               recoletados. */
            <div>
              <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: '#475569' }}>
                {t.confirmSwitchDesc}
              </p>
              {error && (
                <div style={{ color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  ⚠️ {error}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleServerCheckout({})}
                disabled={loading}
                style={{
                  width: '100%', padding: '1rem', background: loading ? '#cbd5e1' : '#10b981', color: '#ffffff',
                  border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? t.processing : t.confirmSwitchBtn}
              </button>
            </div>
          ) : step === 1 ? (
            <form onSubmit={handleBillingSubmit}>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#475569' }}>
                {t.billingIntro}
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="checkout-name" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  {t.fullName}
                </label>
                <input
                  id="checkout-name" type="text" required value={name} onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label htmlFor="checkout-doc" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.doc}</label>
                  <input
                    id="checkout-doc" type="text" required value={doc} onChange={e => setDoc(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="checkout-phone" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.phone}</label>
                  <input
                    id="checkout-phone" type="tel" required value={phone} onChange={e => setPhone(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>{t.billingAddress}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="checkout-cep" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cep}</label>
                  <input id="checkout-cep" type="text" required value={cep} onChange={e => setCep(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-street" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.street}</label>
                  <input id="checkout-street" type="text" required value={street} onChange={e => setStreet(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label htmlFor="checkout-num" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.number}</label>
                  <input id="checkout-num" type="text" required value={addressNumber} onChange={e => setAddressNumber(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-neigh" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.neighborhood}</label>
                  <input id="checkout-neigh" type="text" required value={neighborhood} onChange={e => setNeighborhood(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-city" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.city}</label>
                  <input id="checkout-city" type="text" required value={city} onChange={e => setCity(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-state" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.state}</label>
                  <input id="checkout-state" type="text" required value={state} onChange={e => setState(e.target.value)} maxLength={2} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
              </div>

              {error && (
                <div style={{ color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '1rem', background: loading ? '#cbd5e1' : '#10b981', color: '#ffffff',
                border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
              }}>
                {loading ? t.initializing : t.continueToPayment}
              </button>
            </form>
          ) : (
            /* Step 2: Payment method & checkout */
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button
                  type="button"
                  style={{
                    padding: '0.85rem', borderRadius: '10px',
                    border: `2px solid #10b981`,
                    background: '#f0fdf4',
                    color: '#065f46',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'default'
                  }}
                >
                  {t.cardOption}
                </button>
              </div>



              {paymentMethod === 'card' && gatewayConfig?.gateway === 'stripe' && stripePromise && gatewayConfig.clientSecret && (
                <div style={{ marginBottom: '1.5rem' }}>
                  {/* GAP CORRIGIDO (auditoria completa de i18n, 2026-08-26/27):
                      o SDK do Stripe (@stripe/stripe-js) aceita `locale` nas
                      options do Elements — sem ele, o PaymentElement usava
                      auto-detect do navegador, inconsistente com o idioma
                      escolhido no site (tc_lang). 'es-419' é a variante de
                      espanhol latino-americano do Stripe — mais adequada pro
                      público do Mercosul do que o 'es' genérico (Espanha). */}
                  <Elements stripe={stripePromise} options={{ clientSecret: gatewayConfig.clientSecret, locale: lang === 'es' ? 'es-419' : 'pt-BR' }}>
                    <StripeCheckoutForm
                      lang={lang}
                      onSuccess={(paymentMethodId) => handleServerCheckout({ gatewayToken: paymentMethodId })}
                      onError={setError}
                    />
                  </Elements>
                </div>
              )}

              {paymentMethod === 'card' && gatewayConfig?.gateway === 'mercadopago' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <CardPayment
                    initialization={mpInitialization}
                    onSubmit={handleMpSubmit}
                  />
                </div>
              )}

              {paymentMethod === 'card' && gatewayConfig?.gateway === 'asaas' && (
                <form onSubmit={handleAsaasCardSubmit} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="card-holder" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardHolderName}</label>
                    <input
                      id="card-holder" type="text" required autoComplete="cc-name"
                      value={cardHolderName} onChange={e => setCardHolderName(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="card-number" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardNumber}</label>
                    <input
                      id="card-number" type="text" required inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000"
                      value={cardNumber} onChange={e => setCardNumber(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label htmlFor="card-exp-month" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardExpiry}</label>
                      <input
                        id="card-exp-month" type="text" required inputMode="numeric" maxLength={2} placeholder="MM" autoComplete="cc-exp-month"
                        value={cardExpMonth} onChange={e => setCardExpMonth(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="card-exp-year" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>&nbsp;</label>
                      <input
                        id="card-exp-year" type="text" required inputMode="numeric" maxLength={4} placeholder="AAAA" autoComplete="cc-exp-year"
                        value={cardExpYear} onChange={e => setCardExpYear(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="card-cvv" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardCvv}</label>
                      <input
                        id="card-cvv" type="text" required inputMode="numeric" maxLength={4} placeholder="000" autoComplete="cc-csc"
                        value={cardCvv} onChange={e => setCardCvv(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={tokenizing || loading} style={{
                    width: '100%', padding: '1rem',
                    background: (tokenizing || loading) ? '#cbd5e1' : '#10b981', color: '#ffffff',
                    border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600,
                    cursor: (tokenizing || loading) ? 'not-allowed' : 'pointer', transition: 'background 200ms'
                  }}>
                    {tokenizing ? t.tokenizingCard : loading ? t.processing : t.payWithCard}
                  </button>
                </form>
              )}

              {paymentMethod === 'card' && gatewayConfig?.gateway === 'pagarme' && (
                <form onSubmit={handlePagarmeCardSubmit} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pg-card-holder" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardHolderName}</label>
                    <input
                      id="pg-card-holder" type="text" required autoComplete="cc-name"
                      value={cardHolderName} onChange={e => setCardHolderName(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pg-card-number" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardNumber}</label>
                    <input
                      id="pg-card-number" type="text" required inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000"
                      value={cardNumber} onChange={e => setCardNumber(e.target.value)}
                      style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label htmlFor="pg-card-exp-month" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardExpiry}</label>
                      <input
                        id="pg-card-exp-month" type="text" required inputMode="numeric" maxLength={2} placeholder="MM" autoComplete="cc-exp-month"
                        value={cardExpMonth} onChange={e => setCardExpMonth(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="pg-card-exp-year" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>&nbsp;</label>
                      <input
                        id="pg-card-exp-year" type="text" required inputMode="numeric" maxLength={4} placeholder="AAAA" autoComplete="cc-exp-year"
                        value={cardExpYear} onChange={e => setCardExpYear(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="pg-card-cvv" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{t.cardCvv}</label>
                      <input
                        id="pg-card-cvv" type="text" required inputMode="numeric" maxLength={4} placeholder="000" autoComplete="cc-csc"
                        value={cardCvv} onChange={e => setCardCvv(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={tokenizing || loading} style={{
                    width: '100%', padding: '1rem',
                    background: (tokenizing || loading) ? '#cbd5e1' : '#10b981', color: '#ffffff',
                    border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600,
                    cursor: (tokenizing || loading) ? 'not-allowed' : 'pointer', transition: 'background 200ms'
                  }}>
                    {tokenizing ? t.tokenizingCard : loading ? t.processing : t.payWithCard}
                  </button>
                </form>
              )}

              {paymentMethod === 'card' && gatewayConfig && !TOKENIZED_GATEWAYS.includes(gatewayConfig.gateway) && !CUSTOM_FORM_GATEWAYS.includes(gatewayConfig.gateway) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <p style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.5rem' }}>{t.cardUnavailableTitle}</p>
                  <p style={{ fontSize: '0.875rem', color: '#78350f', margin: 0 }}>
                    {t.cardUnavailableBody}
                  </p>
                </div>
              )}

              {error && (
                <div style={{
                  color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: '10px', padding: '12px 16px', fontSize: '0.875rem', marginBottom: '1rem'
                }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Botão padrão, escondido se for Stripe/MP (têm o próprio botão) ou Asaas (botão dentro do form de cartão acima) */}
              {!(paymentMethod === 'card' && (gatewayConfig?.gateway === 'stripe' || gatewayConfig?.gateway === 'mercadopago' || CUSTOM_FORM_GATEWAYS.includes(gatewayConfig?.gateway || ''))) && (
                <button
                  type="button"
                  onClick={handleNativeCheckout}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '1rem',
                    background: loading ? '#cbd5e1' : '#10b981', color: '#ffffff',
                    border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 200ms'
                  }}
                >
                  {loading ? t.processing : t.goToCheckout}
                </button>
              )}

              <button type="button" onClick={() => setStep(1)} disabled={loading} style={{
                width: '100%', padding: '0.5rem', background: 'transparent', color: '#64748b',
                border: 'none', fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem'
              }}>
                {t.back}
              </button>
            </div>
          )}

          {/* Security badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            {[t.sslBadge, t.pciBadge, t.secureBadge].map(badge => (
              <span key={badge} style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{badge}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StripeCheckoutForm({ onSuccess, onError, lang }: { onSuccess: (pmId: string) => void, onError: (msg: string) => void, lang: Lang }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const t = TRANSLATIONS[lang]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    onError('')

    // Instead of confirming SetupIntent fully with redirect, we just use it to generate the PaymentMethod.
    // wait, Stripe SetupIntent confirm Setup requires redirect mostly.
    // BUT we can use `stripe.createPaymentMethod` with Elements!
    // Or we use confirmSetup with redirect: 'if_required'. Let's do confirmSetup to follow 3D Secure rules.
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/painel',
      },
      redirect: 'if_required'
    })

    if (error) {
      onError(error.message || t.stripeCardError)
      setLoading(false)
    } else if (setupIntent && setupIntent.status === 'succeeded') {
      // payment_method is created and attached
      onSuccess(setupIntent.payment_method as string)
    } else {
      onError(t.stripeUnexpected)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
      <PaymentElement />
      <button type="submit" disabled={!stripe || loading} style={{
        marginTop: '1.5rem', width: '100%', padding: '1rem', background: loading ? '#cbd5e1' : '#10b981', color: '#ffffff',
        border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
      }}>
        {loading ? t.stripeProcessing : t.stripePayButton}
      </button>
    </form>
  )
}
