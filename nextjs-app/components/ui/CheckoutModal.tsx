'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

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

// GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): "R$" estava
// hardcoded em 4 lugares deste modal, enquanto os cards de /planos (fora
// deste modal) já mostravam plan.currency dinamicamente. Sem efeito prático
// hoje (plans.currency é sempre 'BRL' em produção), mas se um dia um plano
// for cadastrado em outra moeda, o valor cobrado mostrado aqui ficaria
// errado silenciosamente.
const CURRENCY_SYMBOLS: Record<string, string> = { BRL: 'R$', USD: 'US$', ARS: 'AR$', PYG: '₲', UYU: '$U' }

// Gateways que tokenizam o cartão no browser. Só eles podem receber pagamento
// por cartão: os dados vão do navegador direto para o gateway, dentro de um
// iframe do próprio provedor, e o nosso servidor nunca vê número nem CVV.
//
// Pagar.me e Asaas ficaram de fora de propósito. Havia aqui um formulário
// próprio que coletava número, validade e CVV em <input> comum e mandava tudo
// para /api/checkout — o que colocaria a aplicação inteira no escopo PCI-DSS
// SAQ-D. Para reativá-los é preciso tokenizar antes de sair do browser
// (Pagar.me tem endpoint público de tokens com a pk_; Asaas, hoje, não).
const TOKENIZED_GATEWAYS = ['stripe', 'mercadopago']

export default function CheckoutModal({ plan, billingCycle = 'monthly', onClose }: { plan: any, billingCycle?: 'monthly' | 'annual', onClose: () => void }) {
  const { session } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [paymentMethod] = useState<PaymentMethod>('card')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gatewayConfig, setGatewayConfig] = useState<{ gateway: string, publicKey: string, clientSecret?: string } | null>(null)
  const [stripePromise, setStripePromise] = useState<any>(null)

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

  // Coupons
  const [couponCode, setCouponCode] = useState('')
  const [coupon, setCoupon] = useState<any>(null)
  const [couponError, setCouponError] = useState('')
  const [loadingCoupon, setLoadingCoupon] = useState(false)

  // --- Price calculation ---
  let basePrice = (plan.promotional_price !== null && plan.promotional_price !== undefined) 
    ? Number(plan.promotional_price) 
    : Number(plan.price)
  if (billingCycle === 'annual') {
    basePrice = (basePrice * 0.8) * 12
  }
  const finalPrice = coupon
    ? (coupon.discount_type === 'percentage'
        ? basePrice * (1 - coupon.discount_value / 100)
        : Math.max(0, basePrice - coupon.discount_value))
    : basePrice
  const currencySymbol = CURRENCY_SYMBOLS[plan.currency] || plan.currency || 'R$'

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

  // --- Initialize Gateway SDK ---
  useEffect(() => {
    if (gatewayConfig?.gateway === 'stripe' && gatewayConfig.publicKey) {
      setStripePromise(loadStripe(gatewayConfig.publicKey))
    } else if (gatewayConfig?.gateway === 'mercadopago' && gatewayConfig.publicKey) {
      initMercadoPago(gatewayConfig.publicKey, { locale: 'pt-BR' })
    }
  }, [gatewayConfig])

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
        setCouponError(data.error || 'Cupom inválido ou inativo.')
        setCoupon(null)
      } else {
        setCoupon({ code: couponCode.toUpperCase(), discount_type: data.discount_type, discount_value: data.discount_value })
      }
    } catch {
      setCouponError('Erro ao validar cupom.')
      setCoupon(null)
    }
    setLoadingCoupon(false)
  }

  // --- Step 1: billing data ---
  const handleBillingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGatewayConfig(data)
      setStep(2)
    } catch(err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Step 2: Unified checkout API caller ---
  const handleServerCheckout = async (paymentData: any) => {
    if (!session?.access_token) {
      setError('Você precisa estar logado para assinar um plano.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const docClean = doc.replace(/\D/g, '')
      if (docClean.length !== 11 && docClean.length !== 14) {
        throw new Error('CPF ou CNPJ inválido. Digite 11 ou 14 números.')
      }

      const phoneClean = phone.replace(/\D/g, '')
      if (phoneClean.length < 10) {
        throw new Error('Telefone inválido. Inclua o DDD (ex: 11999999999).')
      }

      const billingAddress = {
        cep: cep.replace(/\D/g, ''),
        street,
        number: addressNumber,
        neighborhood,
        city,
        state
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
          billingData: { name, doc: docClean, phone: phoneClean },
          billingAddress,
          ...paymentData
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao iniciar o checkout.')
      }

      if (data.success) {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        } else {
          window.location.href = '/painel?subscribed=1'
        }
      } else {
        throw new Error('Falha ao processar assinatura.')
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
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
    if (paymentMethod === 'card' && !TOKENIZED_GATEWAYS.includes(gatewayConfig?.gateway || '')) {
      setError('Pagamento por cartão indisponível para este gateway. Fale com o suporte.')
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
            <span>💳</span> Pagamento Seguro
          </h3>
          <button onClick={onClose} aria-label="Fechar" style={{
            background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748b',
            cursor: 'pointer', width: '32px', height: '32px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
          }}>&times;</button>
        </div>

        <div style={{ padding: '2rem' }}>
          {/* Plan summary */}
          <div style={{
            background: '#f1f5f9', padding: '1rem 1.5rem', borderRadius: '12px',
            marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1.1rem' }}>
              Plano {plan.name} {billingCycle === 'annual' && <span style={{ fontSize: '0.8em', color: '#10b981' }}>(Anual)</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              {coupon ? (
                <>
                  <div style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.9rem' }}>
                    {currencySymbol} {basePrice.toFixed(2).replace('.', ',')} {billingCycle === 'annual' ? '/ano' : '/mês'}
                  </div>
                  <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>
                    {currencySymbol} {finalPrice.toFixed(2).replace('.', ',')} {billingCycle === 'annual' ? '/ano' : '/mês'}
                  </div>
                </>
              ) : (
                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>
                  {currencySymbol} {finalPrice.toFixed(2).replace('.', ',')} {billingCycle === 'annual' ? '/ano' : '/mês'}
                </div>
              )}
            </div>
          </div>

          {/* Coupon (only in step 1) */}
          {step === 1 && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
              {!coupon ? (
                <>
                  <label htmlFor="coupon" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Possui cupom de desconto?
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      id="coupon" type="text" value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      placeholder="Código do cupom"
                      style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px' }}
                    />
                    <button type="button" onClick={handleApplyCoupon} disabled={loadingCoupon || !couponCode}
                      style={{ padding: '0 16px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                      {loadingCoupon ? '...' : 'Aplicar'}
                    </button>
                  </div>
                  {couponError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px' }}>{couponError}</p>}
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>✅ Cupom {coupon.code} aplicado!</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Desconto de {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `${currencySymbol} ${coupon.discount_value}`}
                    </div>
                  </div>
                  <button type="button" onClick={() => { setCoupon(null); setCouponCode('') }}
                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}>
                    Remover
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Billing data form */}
          {step === 1 ? (
            <form onSubmit={handleBillingSubmit}>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#475569' }}>
                Precisamos de alguns dados extras para emitir sua fatura.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="checkout-name" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Nome Completo
                </label>
                <input
                  id="checkout-name" type="text" required value={name} onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label htmlFor="checkout-doc" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>CPF/CNPJ</label>
                  <input
                    id="checkout-doc" type="text" required value={doc} onChange={e => setDoc(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="checkout-phone" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Celular</label>
                  <input
                    id="checkout-phone" type="tel" required value={phone} onChange={e => setPhone(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>Endereço de Cobrança</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="checkout-cep" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>CEP</label>
                  <input id="checkout-cep" type="text" required value={cep} onChange={e => setCep(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-street" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Rua</label>
                  <input id="checkout-street" type="text" required value={street} onChange={e => setStreet(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label htmlFor="checkout-num" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Número</label>
                  <input id="checkout-num" type="text" required value={addressNumber} onChange={e => setAddressNumber(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-neigh" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Bairro</label>
                  <input id="checkout-neigh" type="text" required value={neighborhood} onChange={e => setNeighborhood(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-city" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Cidade</label>
                  <input id="checkout-city" type="text" required value={city} onChange={e => setCity(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', background: '#f8fafc', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label htmlFor="checkout-state" style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado (UF)</label>
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
                {loading ? 'Inicializando Seguro...' : 'Continuar para Pagamento'}
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
                  💳 Cartão de Crédito
                </button>
              </div>



              {paymentMethod === 'card' && gatewayConfig?.gateway === 'stripe' && stripePromise && gatewayConfig.clientSecret && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <Elements stripe={stripePromise} options={{ clientSecret: gatewayConfig.clientSecret }}>
                    <StripeCheckoutForm 
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

              {paymentMethod === 'card' && gatewayConfig && !TOKENIZED_GATEWAYS.includes(gatewayConfig.gateway) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <p style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.5rem' }}>Cartão indisponível no momento</p>
                  <p style={{ fontSize: '0.875rem', color: '#78350f', margin: 0 }}>
                    O meio de pagamento configurado não aceita cartão por aqui. Fale com o suporte para concluir a assinatura.
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

              {/* Botão padrão, escondido se for Stripe (que tem o próprio botão) ou MP (que também tem seu botão no CardPayment) */}
              {!(paymentMethod === 'card' && (gatewayConfig?.gateway === 'stripe' || gatewayConfig?.gateway === 'mercadopago')) && (
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
                  {loading ? 'Processando...' : 'Ir para o Checkout Seguro →'}
                </button>
              )}

              <button type="button" onClick={() => setStep(1)} disabled={loading} style={{
                width: '100%', padding: '0.5rem', background: 'transparent', color: '#64748b',
                border: 'none', fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem'
              }}>
                ← Voltar
              </button>
            </div>
          )}

          {/* Security badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            {['🔒 SSL', '🛡️ PCI-DSS', '✅ Compra Segura'].map(badge => (
              <span key={badge} style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{badge}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StripeCheckoutForm({ onSuccess, onError }: { onSuccess: (pmId: string) => void, onError: (msg: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

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
      onError(error.message || 'Erro ao validar cartão no Stripe.')
      setLoading(false)
    } else if (setupIntent && setupIntent.status === 'succeeded') {
      // payment_method is created and attached
      onSuccess(setupIntent.payment_method as string)
    } else {
      onError('Erro inesperado no Stripe.')
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
        {loading ? 'Processando Stripe...' : 'Pagar com Stripe →'}
      </button>
    </form>
  )
}
