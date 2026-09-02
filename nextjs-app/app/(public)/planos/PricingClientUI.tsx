'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { useLang } from '@/lib/lang-context'
import type { Lang } from '@/lib/constants'
import { getCurrencySymbol as sharedGetCurrencySymbol, formatCurrencyAmount } from '@/lib/currency'
import CheckoutModal from '@/components/ui/CheckoutModal'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { escapeJsonLd } from '@/lib/json-ld'
import styles from './page.module.css'

export interface Plan {
  id: string
  name: string
  name_pt?: string
  name_es?: string
  description?: string
  description_es?: string
  price: number
  promotional_price?: number | null
  // GAP CORRIGIDO (RESOLVER PROBLEMA GEO-LOCALIZAÇÃO): já vinham do banco via
  // `...p` (app/(public)/planos/page.tsx faz um select sem `select=`
  // explícito, então toda coluna de plans volta, incluindo estas), só não
  // estavam tipadas nem usadas aqui — a página sempre mostrava R$,
  // independente de onde o visitante está.
  price_usd?: number | null
  promotional_price_usd?: number | null
  currency: string
  max_ads: number
  max_photos: number
  has_video: boolean
  has_banner: boolean
  highlight_count: number
  sort_order: number
  featuresList: string[]
  featuresListEs?: string[]
  tier: 'free' | 'pro' | 'premium' | string
}

// Strings desta página não existem no dicionário global I18N (lib/constants.ts)
// — seguem o mesmo padrão local já usado em components/ads/AdsSidebar.tsx em
// vez de poluir o dicionário compartilhado.
const TRANSLATIONS = {
  pt: {
    heroTitlePre: 'Escolha seu',
    heroTitleSpan: 'Plano',
    heroSubtitle: 'Venda mais no maior classificado agro do Mercosul. Cancele quando quiser.',
    badgeNoFidelity: 'Sem fidelidade',
    badgeCancelAnytime: 'Cancele a qualquer momento',
    badgeSecurePayment: 'Pagamento 100% Seguro',
    billingMonthly: 'Mensal',
    billingAnnual: 'Anual',
    billingToggleAria: 'Alternar faturamento anual com desconto',
    annualNote: 'Faturado anualmente (20% OFF)',
    free: 'Grátis',
    perMonth: '/mês',
    unlimitedAds: 'Anúncios Ilimitados',
    activeAds: (n: number) => `${n} anúncios ativos`,
    upToPhotos: (n: number) => `Até ${n} fotos por anúncio`,
    highlightsMonth: (n: number) => `${n} destaques mensais`,
    popularBadge: '⭐ Mais Popular',
    currentBadge: '✓ Plano Atual',
    currentPlanBtn: 'Plano Atual',
    processing: 'Processando...',
    downgradeBtn: 'Fazer Downgrade',
    startFreeBtn: 'Começar Grátis',
    subscribeBtn: 'Assinar',
    compareTitle: 'Comparação Completa',
    compareSub: 'Tudo que cada plano inclui, sem surpresas.',
    colFeature: 'Recurso',
    colFree: 'Grátis',
    colPro: 'PRO',
    colPremium: 'Premium',
    rowActiveAds: 'Anúncios ativos',
    rowPhotos: 'Fotos por anúncio',
    rowVideo: 'Vídeo no anúncio',
    rowVideoDesc: 'Upload de vídeo demonstração',
    rowSelo: 'Selo Verificado',
    rowSeloDesc: 'Aumenta a confiança do comprador',
    rowHighlights: 'Destaques na Home',
    rowHighlightsDesc: 'Anúncios em posição privilegiada',
    rowBanner: 'Banner de perfil',
    rowBannerDesc: 'Sua marca em destaque no perfil',
    rowSupport: 'Suporte',
    rowAnalytics: 'Análise de desempenho',
    rowAnalyticsDesc: 'Visualizações, cliques, conversões',
    basic: 'Básica',
    advanced: 'Avançada',
    rowAuction: 'Participação em Leilões',
    rowPrice: 'Preço',
    unlimited: 'Ilimitado',
    perMonthTable: '/mês',
    supportEmail: 'Email',
    plansLoadError: 'Não foi possível carregar os planos agora. Tente novamente em instantes.',
    plansEmpty: 'Nenhum plano disponível no momento.',
    faqTitle: 'Perguntas Frequentes',
    faqCancelQ: 'Como faço para cancelar minha assinatura?',
    faqCancelA: "Você pode cancelar a qualquer momento pelo seu painel, na aba 'Assinatura'. O acesso ao plano continua até o fim do período pago. Não há multa ou fidelidade.",
    faqChangeQ: 'Posso mudar de plano no meio do mês?',
    faqChangeA: 'Sim! Você pode fazer upgrade ou downgrade a qualquer momento — a troca é aplicada imediatamente. No upgrade, a cobrança do plano novo pode ser proporcional aos dias restantes (dependendo do seu método de pagamento) e a diferença aparece no seu histórico de faturas. No downgrade, nada é cobrado agora — o preço novo só vale a partir da próxima renovação.',
    faqPaymentQ: 'Quais formas de pagamento são aceitas?',
    faqPaymentA: 'Aceitamos cartão de crédito e débito.',
    faqAdsQ: 'Meus anúncios somem se eu cancelar?',
    faqAdsA: 'Não. Seus anúncios continuam visíveis, mas voltam ao limite do plano Grátis (3 ativos). Os demais ficam pausados automaticamente.',
    confirmTitle: 'Confirmação',
    confirmDowngradeMsg: 'Tem certeza que deseja voltar para o plano Grátis? Você continua com acesso ao plano atual até o fim do período já pago.',
    sessionExpired: 'Sessão expirada. Faça login novamente.',
    downgradeErrorGeneric: 'Erro ao processar downgrade',
    downgradeSuccessDefault: 'Downgrade agendado — seu plano volta pro Grátis no fim do período já pago.',
    downgradeErrorUnexpected: 'Erro inesperado ao processar downgrade',
  },
  es: {
    heroTitlePre: 'Elige tu',
    heroTitleSpan: 'Plan',
    heroSubtitle: 'Vende más en el mayor clasificado agro del Mercosur. Cancela cuando quieras.',
    badgeNoFidelity: 'Sin permanencia',
    badgeCancelAnytime: 'Cancela en cualquier momento',
    badgeSecurePayment: 'Pago 100% Seguro',
    billingMonthly: 'Mensual',
    billingAnnual: 'Anual',
    billingToggleAria: 'Alternar facturación anual con descuento',
    annualNote: 'Facturado anualmente (20% OFF)',
    free: 'Gratis',
    perMonth: '/mes',
    unlimitedAds: 'Anuncios Ilimitados',
    activeAds: (n: number) => `${n} anuncios activos`,
    upToPhotos: (n: number) => `Hasta ${n} fotos por anuncio`,
    highlightsMonth: (n: number) => `${n} destacados mensuales`,
    popularBadge: '⭐ Más Popular',
    currentBadge: '✓ Plan Actual',
    currentPlanBtn: 'Plan Actual',
    processing: 'Procesando...',
    downgradeBtn: 'Bajar de Plan',
    startFreeBtn: 'Comenzar Gratis',
    subscribeBtn: 'Suscribirse',
    compareTitle: 'Comparación Completa',
    compareSub: 'Todo lo que incluye cada plan, sin sorpresas.',
    colFeature: 'Función',
    colFree: 'Gratis',
    colPro: 'PRO',
    colPremium: 'Premium',
    rowActiveAds: 'Anuncios activos',
    rowPhotos: 'Fotos por anuncio',
    rowVideo: 'Video en el anuncio',
    rowVideoDesc: 'Carga de video de demostración',
    rowSelo: 'Sello Verificado',
    rowSeloDesc: 'Aumenta la confianza del comprador',
    rowHighlights: 'Destacados en el Inicio',
    rowHighlightsDesc: 'Anuncios en posición privilegiada',
    rowBanner: 'Banner de perfil',
    rowBannerDesc: 'Tu marca destacada en el perfil',
    rowSupport: 'Soporte',
    rowAnalytics: 'Análisis de rendimiento',
    rowAnalyticsDesc: 'Visualizaciones, clics, conversiones',
    basic: 'Básico',
    advanced: 'Avanzado',
    rowAuction: 'Participación en Remates',
    rowPrice: 'Precio',
    unlimited: 'Ilimitado',
    perMonthTable: '/mes',
    supportEmail: 'Email',
    plansLoadError: 'No fue posible cargar los planes ahora. Intentá de nuevo en unos instantes.',
    plansEmpty: 'Ningún plan disponible en este momento.',
    faqTitle: 'Preguntas Frecuentes',
    faqCancelQ: '¿Cómo hago para cancelar mi suscripción?',
    faqCancelA: "Puedes cancelar en cualquier momento desde tu panel, en la pestaña 'Suscripción'. El acceso al plan continúa hasta el final del período ya pagado. No hay multa ni permanencia.",
    faqChangeQ: '¿Puedo cambiar de plan a mitad de mes?',
    faqChangeA: '¡Sí! Puedes hacer upgrade o downgrade en cualquier momento — el cambio se aplica de inmediato. En el upgrade, el cobro del plan nuevo puede ser proporcional a los días restantes (según tu método de pago) y la diferencia aparece en tu historial de facturas. En el downgrade, no se cobra nada ahora — el precio nuevo solo vale a partir de la próxima renovación.',
    faqPaymentQ: '¿Qué formas de pago se aceptan?',
    faqPaymentA: 'Aceptamos tarjeta de crédito y débito.',
    faqAdsQ: '¿Mis anuncios desaparecen si cancelo?',
    faqAdsA: 'No. Tus anuncios siguen visibles, pero vuelven al límite del plan Gratis (3 activos). Los demás quedan pausados automáticamente.',
    confirmTitle: 'Confirmación',
    confirmDowngradeMsg: '¿Estás seguro de que deseas volver al plan Gratis? Seguirás con acceso a tu plan actual hasta el final del período ya pagado.',
    sessionExpired: 'Sesión expirada. Inicia sesión nuevamente.',
    downgradeErrorGeneric: 'Error al procesar el cambio de plan',
    downgradeSuccessDefault: 'Cambio de plan programado — tu plan vuelve a Gratis al final del período ya pagado.',
    downgradeErrorUnexpected: 'Error inesperado al procesar el cambio de plan',
  },
} as const

// BUG CORRIGIDO (validação do zero, rodada 6): variar o símbolo de moeda por
// locale via Intl.NumberFormat mostrava "BRL 160,00" em vez de "R$ 160,00"
// pra usuários em espanhol (es-AR não tem símbolo de BRL no CLDR) — ver
// lib/currency.ts para a explicação completa. Símbolo agora vem de mapa
// fixo; só o NÚMERO (separador decimal/milhar) varia por idioma.
function getCurrencySymbol(currency: string) {
  return sharedGetCurrencySymbol(currency)
}

function formatAmount(amount: number, lang: Lang) {
  return formatCurrencyAmount(amount, lang)
}

function FAQItem({ question, answer, id }: { question: string, answer: string, id: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}>
      <button
        className={styles.faqQ}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${id}`}
      >
        {question} <span className={styles.faqArrow} aria-hidden="true">▾</span>
      </button>
      <div id={`faq-answer-${id}`} className={styles.faqA}>
        <div className={styles.faqAInner}>
          <p>{answer}</p>
        </div>
      </div>
    </div>
  )
}

export default function PricingClientUI({ initialPlans, plansError = false }: { initialPlans: Plan[]; plansError?: boolean }) {
  const { confirm } = useConfirm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session } = useAuth()
  const { lang } = useLang()
  const t = TRANSLATIONS[lang]

  // BUG CORRIGIDO (auditoria de SEO, 2ª rodada — cobertura de dados
  // estruturados): esta página já tem 4 perguntas/respostas reais e
  // traduzidas (a seção FAQ mais abaixo), candidata óbvia a FAQPage —
  // nenhuma página do site tinha esse schema. Rich result de FAQ no
  // Google (quando elegível) ocupa mais espaço visual no resultado de
  // busca, aumentando CTR justo na página que fecha a assinatura.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: t.faqCancelQ, acceptedAnswer: { '@type': 'Answer', text: t.faqCancelA } },
      { '@type': 'Question', name: t.faqChangeQ, acceptedAnswer: { '@type': 'Answer', text: t.faqChangeA } },
      { '@type': 'Question', name: t.faqPaymentQ, acceptedAnswer: { '@type': 'Answer', text: t.faqPaymentA } },
      { '@type': 'Question', name: t.faqAdsQ, acceptedAnswer: { '@type': 'Answer', text: t.faqAdsA } },
    ],
  }

  const [userPlanId, setUserPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  // GAP CORRIGIDO (RESOLVER PROBLEMA GEO-LOCALIZAÇÃO): a página é SSR/ISR
  // (page.tsx: `revalidate = 3600`) — o HTML é o MESMO pra todo visitante
  // dentro da janela de cache, então a moeda não pode ser decidida no
  // servidor sem desligar o cache. Detecção client-side, só por IP (sem
  // pedir permissão de GPS — preço não precisa de precisão de metros,
  // /api/geoip já é o mesmo provedor usado em outros pontos do app via
  // lib/useGeoLocation.ts). Default BRL: mesma regra seria usada mesmo que
  // o geoip falhasse (ver isNational em app/api/checkout/route.ts, que
  // também assume nacional quando o país não é conhecido) — visitante
  // brasileiro (a maioria) nunca vê flash de preço.
  const [displayCurrency, setDisplayCurrency] = useState<'BRL' | 'USD'>('BRL')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/geoip?lang=${lang}`, { signal: AbortSignal.timeout(6000) })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.countryCode) return
        if (data.countryCode.toUpperCase() !== 'BR') setDisplayCurrency('USD')
      })
      .catch(() => { /* mantém BRL — mesmo fallback seguro do checkout */ })
    return () => { cancelled = true }
  }, [lang])

  // Preço/moeda por plano pra exibição — mesma regra de useUsd em
  // app/api/checkout/init/route.ts (Stripe é o único gateway internacional,
  // mas aqui ainda nem se sabe o gateway; plan.price_usd cadastrado é o
  // sinal de que o plano TEM preço internacional definido pelo admin). Sem
  // price_usd, continua em BRL mesmo pra visitante fora do Brasil — igual ao
  // fallback já usado no checkout real.
  const priceFor = (p: Plan) => {
    const useUsd = displayCurrency === 'USD' && p.price_usd !== null && p.price_usd !== undefined
    return {
      currency: useUsd ? 'USD' : 'BRL',
      price: useUsd ? Number(p.price_usd) : Number(p.price),
      promo: useUsd
        ? (p.promotional_price_usd !== null && p.promotional_price_usd !== undefined ? Number(p.promotional_price_usd) : null)
        : (p.promotional_price !== null && p.promotional_price !== undefined ? Number(p.promotional_price) : null),
    }
  }

  useEffect(() => {
    async function fetchUserPlan() {
      if (session) {
        const sb = getSupabase()
        try {
          // BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): o
          // badge "Plano Atual" nunca aparecia pra nenhum assinante real
          // porque lia profiles.plan_id — coluna que nenhum fluxo real de
          // ativação toca. O único lugar que grava plan_id de verdade
          // (app/api/webhooks/payments/route.ts, evento subscription.
          // activated/renewed) escreve em user_secrets.plan_id.
          const { data: secrets } = await sb
            .from('user_secrets')
            .select('plan_id')
            .eq('id', session.user.id)
            .single()
          if (secrets?.plan_id) {
            setUserPlanId(secrets.plan_id)
          }
        } catch (err) {
          console.error('Erro ao buscar plano do usuário:', err)
        }
      }
    }
    fetchUserPlan()
  }, [session])

  useEffect(() => {
    // If redirected back from login with a plan intent
    const intentPlanId = searchParams?.get('plan_id')
    if (session && intentPlanId) {
      const planToResume = initialPlans.find(p => p.id === intentPlanId)
      if (planToResume && planToResume.price > 0) {
        setSelectedPlan(planToResume)
      }
    }
  }, [session, searchParams, initialPlans])

  const [downgrading, setDowngrading] = useState(false)

  const handlePlanClick = async (plan: Plan) => {
    if (!session) {
      // BUG CORRIGIDO (varredura cruzada de cenários): LoginForm.tsx só lê
      // (e propaga de volta) o parâmetro redirect/next/redirectTo em si —
      // um plan_id como parâmetro IRMÃO (?redirect=/planos&plan_id=X) era
      // descartado no round-trip do login, então o efeito que reabre o
      // CheckoutModal automaticamente (searchParams.get('plan_id') acima)
      // nunca disparava: usuário deslogado clicava em "Assinar", logava, e
      // caía numa /planos pelada, precisando escolher o plano de novo.
      // Embutindo plan_id DENTRO do próprio valor de redirect (que
      // sobrevive ao round-trip) resolve sem precisar mudar LoginForm.tsx.
      router.push(`/login?redirect=${encodeURIComponent(`/planos?plan_id=${plan.id}`)}`)
      return
    }

    if (plan.price <= 0) {
      // BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25): este botão
      // era um alert() dizendo "simulação" — nenhuma chamada de API, nada
      // persistido. "Fazer Downgrade" só aparece quando o usuário já tem
      // plan_id (assinatura paga real), e downgrade pro Grátis é
      // exatamente a mesma regra que já vale pra cancelar: acesso ao plano
      // pago continua até o fim do período já pago (cancel_at_period_end),
      // não perde na hora. Reaproveita a MESMA rota de cancelamento já
      // validada, em vez de duplicar a lógica.
      if (!(await confirm(t.confirmDowngradeMsg, t.confirmTitle))) return
      setDowngrading(true)
      try {
        const sb = getSupabase()
        const { data: { session: freshSession } } = await sb.auth.getSession()
        if (!freshSession?.access_token) throw new Error(t.sessionExpired)
        const res = await fetch('/api/subscriptions/cancel', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${freshSession.access_token}` },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t.downgradeErrorGeneric)
        alert(data.message || t.downgradeSuccessDefault)
        router.refresh()
      } catch (err: any) {
        alert(err.message || t.downgradeErrorUnexpected)
      } finally {
        setDowngrading(false)
      }
    } else {
      setSelectedPlan(plan)
    }
  }

  // Derive plans for comparison table based on sort_order as fallback if tier isn't present
  const free = initialPlans.find(p => p.tier === 'free' || p.sort_order === 1) || ({} as Plan)
  const pro = initialPlans.find(p => p.tier === 'pro' || p.sort_order === 2) || ({} as Plan)
  const premium = initialPlans.find(p => p.tier === 'premium' || p.sort_order === 3) || ({} as Plan)

  // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): a tabela
  // comparativa hardcodava "R$" enquanto os cards logo acima já usavam
  // plan.currency dinamicamente — mesma classe do fix em CheckoutModal.tsx.
  const currencySymbol = (p: Plan) => getCurrencySymbol(priceFor(p).currency)

  // GAP CORRIGIDO (auditoria completa de i18n, 2026-08-26/27): nome/descrição/
  // features vinham só da coluna _pt, mesmo com lang="es" — plans.name_es/
  // description_es/features_es já foram traduzidas e populadas pros 3 planos
  // reais (migration + script). Mesmo padrão de fallback já usado em `ads`
  // (lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt).
  const planName = (p: Plan) => (lang === 'es' && p.name_es) ? p.name_es : (p.name_pt || p.name)
  const planDescription = (p: Plan) => (lang === 'es' && p.description_es) ? p.description_es : (p.description || '')
  const planFeatures = (p: Plan) => (lang === 'es' && p.featuresListEs && p.featuresListEs.length > 0) ? p.featuresListEs : p.featuresList

  const hasSelo = (p: Plan) => {
    return planFeatures(p)?.some(feat => feat.toLowerCase().includes('selo') || feat.toLowerCase().includes('sello')) || false
  }

  const getSuporte = (p: Plan) => {
    const feats = planFeatures(p)
    if (!feats) return t.supportEmail
    const sup = feats.find(feat => feat.toLowerCase().includes('suporte') || feat.toLowerCase().includes('soporte'))
    // BUG CORRIGIDO (teste ao vivo em ES, auditoria completa de i18n): a
    // frase em espanhol popularizada por migration é "Soporte prioritario
    // POR WhatsApp" (com "por"), diferente do PT "Suporte prioritário
    // WhatsApp" (sem "por") — removendo só "Soporte prioritario" sobrava
    // "por WhatsApp" na coluna PRO da tabela. Padrões mais específicos
    // (com "por") precisam vir antes dos mais genéricos na cadeia.
    return sup ? sup
      .replace('Suporte prioritário por', '').replace('Suporte prioritário', '').replace('Suporte por', '').replace('Suporte', '')
      .replace('Soporte prioritario por', '').replace('Soporte prioritario', '').replace('Soporte por', '').replace('Soporte', '')
      .trim() : t.supportEmail
  }

  return (
    <>
      <section className={styles.pricingHero}>
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <h1>
            {t.heroTitlePre} <span>{t.heroTitleSpan}</span>
          </h1>
          <p>
            {t.heroSubtitle}
          </p>
          <div className={styles.heroBadges}>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> {t.badgeNoFidelity}
            </span>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> {t.badgeCancelAnytime}
            </span>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> {t.badgeSecurePayment}
            </span>
          </div>

          <div className={styles.billingToggleWrapper}>
            <span className={`${styles.billingLabel} ${billingCycle === 'monthly' ? styles.billingLabelActive : ''}`}>{t.billingMonthly}</span>
            <button
              role="switch"
              aria-checked={billingCycle === 'annual'}
              aria-label={t.billingToggleAria}
              className={`${styles.billingSwitch} ${billingCycle === 'annual' ? styles.billingSwitchActive : ''}`}
              onClick={() => setBillingCycle(c => c === 'monthly' ? 'annual' : 'monthly')}
            >
              <span className={`${styles.billingKnob} ${billingCycle === 'annual' ? styles.billingKnobActive : ''}`} />
            </button>
            <span className={`${styles.billingLabel} ${billingCycle === 'annual' ? styles.billingLabelActive : ''}`}>
              {t.billingAnnual}
              <span className={styles.discountBadge}>-20%</span>
            </span>
          </div>
        </div>
      </section>

      <main className="container" style={{ position: 'relative', zIndex: 10 }}>

        {/* BUG CORRIGIDO (varredura cruzada de cenários): sem esta checagem,
            uma falha real na busca de planos (rede, RLS) ou uma tabela
            genuinamente vazia produzia o mesmo resultado — initialPlans=[] —
            e o grid/tabela comparativa renderizavam em branco (free/pro/
            premium caindo no fallback `{} as Plan`, gerando células vazias
            ou "undefined"), sem nenhuma explicação pro visitante. */}
        {plansError ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--clr-text-muted, #64748b)' }}>{t.plansLoadError}</div>
        ) : initialPlans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--clr-text-muted, #64748b)' }}>{t.plansEmpty}</div>
        ) : (
        <>
        <div className={styles.pricingGrid}>
          {initialPlans.map(plan => {
            const isFree = plan.price <= 0
            // BUG CORRIGIDO (teste do plano Grátis, 2026-08-25): user_secrets.
            // plan_id só é gravado pelo webhook de pagamento (planos pagos) —
            // quem está no Grátis (o padrão de todo mundo, via fallback do
            // trigger enforce_ad_quota) sempre tem plan_id NULL. Sem este
            // fallback, isCurrent nunca era true pro card Grátis, e o botão
            // mostrava "Começar Grátis" pra quem já estava nele.
            const isCurrent = !!session && (userPlanId ? userPlanId === plan.id : isFree)
            const isPopular = plan.sort_order === 2

            return (
              <div key={plan.id} className={`${styles.pricingCard} ${isPopular ? styles.popular : ''}`}>
                {isPopular && <div className={styles.popularBadge}>{t.popularBadge}</div>}
                {isCurrent && <div className={styles.currentBadge}>{t.currentBadge}</div>}

                <div className={styles.planHeader}>
                  <h2>{planName(plan)}</h2>
                  <p>{planDescription(plan)}</p>

                  {isFree ? (
                    <div className={styles.freePrice}><span className={styles.amount}>{t.free}</span></div>
                  ) : (() => {
                    const { currency: planCurrency, price: planPrice, promo: planPromo } = priceFor(plan)
                    return (
                    <div className={styles.proPrice}>
                      <span className={styles.currency}>{getCurrencySymbol(planCurrency)}</span>

                      {(planPromo ?? 0) > 0 ? (
                        <>
                          <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '1.2rem', marginRight: '8px' }}>
                            {formatAmount(billingCycle === 'monthly' ? planPrice : planPrice * 0.8, lang)}
                          </span>
                          <span className={styles.amount} style={{ color: '#22c55e' }}>
                            {formatAmount(billingCycle === 'monthly' ? Number(planPromo) : Number(planPromo) * 0.8, lang)}
                          </span>
                        </>
                      ) : (
                        <span className={styles.amount}>
                          {formatAmount(billingCycle === 'monthly' ? planPrice : planPrice * 0.8, lang)}
                        </span>
                      )}

                      <span className={styles.period}>{t.perMonth}</span>
                    </div>
                    )
                  })()}
                  {billingCycle === 'annual' && !isFree && (
                    <div className={styles.annualNote}>{t.annualNote}</div>
                  )}
                </div>

                <ul className={styles.planFeatures}>
                  <li><span className={styles.featCheck} aria-hidden="true">✓</span> {plan.max_ads >= 9999 ? t.unlimitedAds : t.activeAds(plan.max_ads)}</li>
                  <li><span className={styles.featCheck} aria-hidden="true">✓</span> {t.upToPhotos(plan.max_photos)}</li>
                  {plan.highlight_count > 0 && (
                    <li><span className={styles.featCheck} aria-hidden="true">✓</span> {t.highlightsMonth(plan.highlight_count)}</li>
                  )}
                  {planFeatures(plan).map((f, i) => (
                    <li key={i}><span className={styles.featCheck} aria-hidden="true">✓</span> {f}</li>
                  ))}
                </ul>

                <button
                  className={`${styles.btnPlan} ${isFree ? styles.btnFree : (isPopular ? styles.btnPro : styles.btnPremium)} ${isCurrent ? styles.btnCurrent : ''}`}
                  disabled={isCurrent || downgrading}
                  onClick={() => handlePlanClick(plan)}
                >
                  {isCurrent ? t.currentPlanBtn : (isFree ? (userPlanId ? (downgrading ? t.processing : t.downgradeBtn) : t.startFreeBtn) : t.subscribeBtn)}
                </button>
              </div>
            )
          })}
        </div>

        {/* COMPARISON TABLE */}
        <section className={styles.compareSection}>
          <h2>{t.compareTitle}</h2>
          <p className={styles.compareSub}>{t.compareSub}</p>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th scope="col" style={{textAlign: 'left'}}>{t.colFeature}</th>
                  <th scope="col">{t.colFree}</th>
                  <th scope="col" style={{color: '#22c55e'}}>{t.colPro}</th>
                  <th scope="col" style={{color: '#f59e0b'}}>{t.colPremium}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.featName}>{t.rowActiveAds}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillFree}`}>{free.max_ads}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.max_ads}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{t.unlimited}</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>{t.rowPhotos}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillFree}`}>{free.max_photos}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.max_photos}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{premium.max_photos}</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>{t.rowVideo}</span>
                    <span className={styles.featDesc}>{t.rowVideoDesc}</span>
                  </td>
                  <td>{free.has_video ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{pro.has_video ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{premium.has_video ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>{t.rowSelo}</span>
                    <span className={styles.featDesc}>{t.rowSeloDesc}</span>
                  </td>
                  <td>{hasSelo(free) ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{hasSelo(pro) ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{hasSelo(premium) ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>{t.rowHighlights}</span>
                    <span className={styles.featDesc}>{t.rowHighlightsDesc}</span>
                  </td>
                  <td><span className={styles.tblCross} aria-hidden="true">✕</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.highlight_count}{t.perMonthTable}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{premium.highlight_count}{t.perMonthTable}</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>{t.rowBanner}</span>
                    <span className={styles.featDesc}>{t.rowBannerDesc}</span>
                  </td>
                  <td>{free.has_banner ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{pro.has_banner ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{premium.has_banner ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>{t.rowSupport}</span></td>
                  <td>{getSuporte(free)}</td>
                  <td>{getSuporte(pro)}</td>
                  <td><span className={styles.tblGold}>{getSuporte(premium)}</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>{t.rowAnalytics}</span>
                    <span className={styles.featDesc}>{t.rowAnalyticsDesc}</span>
                  </td>
                  <td><span className={styles.tblCross} aria-hidden="true">✕</span></td>
                  <td>{t.basic}</td>
                  <td><span className={styles.tblGold}>{t.advanced}</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>{t.rowAuction}</span></td>
                  <td><span className={styles.tblCheck} aria-hidden="true">✓</span></td>
                  <td><span className={styles.tblCheck} aria-hidden="true">✓</span></td>
                  <td><span className={styles.tblGold} aria-hidden="true">✓</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>{t.rowPrice}</span></td>
                  <td><strong style={{color: '#818cf8'}}>{free.price <= 0 ? t.free : currencySymbol(free) + formatAmount(priceFor(free).price, lang) + t.perMonthTable}</strong></td>
                  <td><strong style={{color: '#22c55e'}}>{currencySymbol(pro)}{formatAmount(priceFor(pro).price, lang)}{t.perMonthTable}</strong></td>
                  <td><strong style={{color: '#f59e0b'}}>{currencySymbol(premium)}{formatAmount(priceFor(premium).price, lang)}{t.perMonthTable}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        </>
        )}

        {/* FAQ SECTION */}
        <section className={styles.faqSection}>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: escapeJsonLd(faqJsonLd) }}
          />
          <h2>{t.faqTitle}</h2>
          <FAQItem
            id="cancelamento"
            question={t.faqCancelQ}
            answer={t.faqCancelA}
          />
          <FAQItem
            id="mudanca-plano"
            question={t.faqChangeQ}
            // TEXTO AJUSTADO (revisão de regras de negócio, 2026-08-25): a
            // versão antiga prometia pro-rata no upgrade e "próximo ciclo"
            // no downgrade pra TODOS os métodos de pagamento — só a Stripe
            // (usuário internacional) tem essa API pronta. Mercado Pago,
            // Pagar.me e Asaas (a maioria dos usuários, nacional) trocam de
            // plano cobrando o valor cheio na hora, sem pro-rata. Texto
            // ajustado pra não prometer o que nem todo gateway cumpre.
            // TEXTO AJUSTADO (validação de 2026-08-26): "aparece certinha no
            // seu histórico de faturas" dava a entender que sempre há algo
            // visível na hora — mas um downgrade via Stripe (prorate=false)
            // não gera fatura nenhuma agora, só na próxima renovação.
            answer={t.faqChangeA}
          />
          <FAQItem
            id="pagamento"
            question={t.faqPaymentQ}
            // TEXTO CORRIGIDO (validação de 2026-08-26): prometia Pix e
            // boleto — nenhum dos 4 gateways aceita (todos rejeitam
            // qualquer método != 'card'). O seletor de método no
            // CheckoutModal (com essas opções) nunca foi conectado a nada.
            answer={t.faqPaymentA}
          />
          <FAQItem
            id="anuncios-cancelamento"
            question={t.faqAdsQ}
            answer={t.faqAdsA}
          />
        </section>
      </main>

      {selectedPlan && (
        <CheckoutModal
          plan={selectedPlan}
          billingCycle={billingCycle}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </>
  )
}
