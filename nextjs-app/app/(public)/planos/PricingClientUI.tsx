'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import CheckoutModal from '@/components/ui/CheckoutModal'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import styles from './page.module.css'

export interface Plan {
  id: string
  name: string
  name_pt?: string
  description?: string
  price: number
  promotional_price?: number | null
  currency: string
  max_ads: number
  max_photos: number
  has_video: boolean
  has_banner: boolean
  highlight_count: number
  sort_order: number
  featuresList: string[]
  tier: 'free' | 'pro' | 'premium' | string
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
        <p>{answer}</p>
      </div>
    </div>
  )
}

export default function PricingClientUI({ initialPlans }: { initialPlans: Plan[] }) {
  const { confirm } = useConfirm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session } = useAuth()
  const [userPlanId, setUserPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

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
      router.push(`/login?redirect=/planos&plan_id=${plan.id}`)
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
      if (!(await confirm('Tem certeza que deseja voltar para o plano Grátis? Você continua com acesso ao plano atual até o fim do período já pago.'))) return
      setDowngrading(true)
      try {
        const sb = getSupabase()
        const { data: { session: freshSession } } = await sb.auth.getSession()
        if (!freshSession?.access_token) throw new Error('Sessão expirada. Faça login novamente.')
        const res = await fetch('/api/subscriptions/cancel', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${freshSession.access_token}` },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao processar downgrade')
        alert(data.message || 'Downgrade agendado — seu plano volta pro Grátis no fim do período já pago.')
        router.refresh()
      } catch (err: any) {
        alert(err.message || 'Erro inesperado ao processar downgrade')
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

  const hasSelo = (p: Plan) => {
    return p.featuresList?.some(feat => feat.toLowerCase().includes('selo')) || false
  }

  const getSuporte = (p: Plan) => {
    if (!p.featuresList) return 'Email'
    const sup = p.featuresList.find(feat => feat.toLowerCase().includes('suporte'))
    return sup ? sup.replace('Suporte por', '').replace('Suporte prioritário', '').replace('Suporte', '').trim() : 'Email'
  }

  return (
    <>
      <section className={styles.pricingHero}>
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <h1>
            Escolha seu <span>Plano</span>
          </h1>
          <p>
            Venda mais no maior classificado agro do Mercosul. Cancele quando quiser.
          </p>
          <div className={styles.heroBadges}>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> Sem fidelidade
            </span>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> Cancele a qualquer momento
            </span>
            <span className={styles.heroBadge}>
              <span className={styles.hbCheck}>✓</span> Pagamento 100% Seguro
            </span>
          </div>

          <div className={styles.billingToggleWrapper}>
            <span className={`${styles.billingLabel} ${billingCycle === 'monthly' ? styles.billingLabelActive : ''}`}>Mensal</span>
            <button 
              role="switch"
              aria-checked={billingCycle === 'annual'}
              aria-label="Alternar faturamento anual com desconto"
              className={`${styles.billingSwitch} ${billingCycle === 'annual' ? styles.billingSwitchActive : ''}`}
              onClick={() => setBillingCycle(c => c === 'monthly' ? 'annual' : 'monthly')}
            >
              <span className={`${styles.billingKnob} ${billingCycle === 'annual' ? styles.billingKnobActive : ''}`} />
            </button>
            <span className={`${styles.billingLabel} ${billingCycle === 'annual' ? styles.billingLabelActive : ''}`}>
              Anual
              <span className={styles.discountBadge}>-20%</span>
            </span>
          </div>
        </div>
      </section>

      <main className="container" style={{ position: 'relative', zIndex: 10 }}>
        
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
                {isPopular && <div className={styles.popularBadge}>⭐ Mais Popular</div>}
                {isCurrent && <div className={styles.currentBadge}>✓ Plano Atual</div>}
                
                <div className={styles.planHeader}>
                  <h2>{plan.name_pt || plan.name}</h2>
                  <p>{plan.description || ''}</p>
                  
                  {isFree ? (
                    <div className={styles.freePrice}><span className={styles.amount}>Grátis</span></div>
                  ) : (
                    <div className={styles.proPrice}>
                      <span className={styles.currency}>{plan.currency === 'BRL' ? 'R$' : plan.currency}</span>
                      
                      {(plan.promotional_price ?? 0) > 0 ? (
                        <>
                          <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '1.2rem', marginRight: '8px' }}>
                            {billingCycle === 'monthly' ? plan.price : (plan.price * 0.8).toFixed(2).replace('.', ',')}
                          </span>
                          <span className={styles.amount} style={{ color: '#22c55e' }}>
                            {billingCycle === 'monthly' ? Number(plan.promotional_price) : (Number(plan.promotional_price) * 0.8).toFixed(2).replace('.', ',')}
                          </span>
                        </>
                      ) : (
                        <span className={styles.amount}>
                          {billingCycle === 'monthly' ? plan.price : (plan.price * 0.8).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      
                      <span className={styles.period}>/mês</span>
                    </div>
                  )}
                  {billingCycle === 'annual' && !isFree && (
                    <div className={styles.annualNote}>Faturado anualmente (20% OFF)</div>
                  )}
                </div>
                
                <ul className={styles.planFeatures}>
                  <li><span className={styles.featCheck} aria-hidden="true">✓</span> {plan.max_ads >= 9999 ? 'Anúncios Ilimitados' : `${plan.max_ads} anúncios ativos`}</li>
                  <li><span className={styles.featCheck} aria-hidden="true">✓</span> Até {plan.max_photos} fotos por anúncio</li>
                  {plan.highlight_count > 0 && (
                    <li><span className={styles.featCheck} aria-hidden="true">✓</span> {plan.highlight_count} destaques mensais</li>
                  )}
                  {plan.featuresList.map((f, i) => (
                    <li key={i}><span className={styles.featCheck} aria-hidden="true">✓</span> {f}</li>
                  ))}
                </ul>
                
                <button
                  className={`${styles.btnPlan} ${isFree ? styles.btnFree : (isPopular ? styles.btnPro : styles.btnPremium)} ${isCurrent ? styles.btnCurrent : ''}`}
                  disabled={isCurrent || downgrading}
                  onClick={() => handlePlanClick(plan)}
                >
                  {isCurrent ? 'Plano Atual' : (isFree ? (userPlanId ? (downgrading ? 'Processando...' : 'Fazer Downgrade') : 'Começar Grátis') : 'Assinar')}
                </button>
              </div>
            )
          })}
        </div>

        {/* COMPARISON TABLE */}
        <section className={styles.compareSection}>
          <h2>Comparação Completa</h2>
          <p className={styles.compareSub}>Tudo que cada plano inclui, sem surpresas.</p>
          
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th scope="col" style={{textAlign: 'left'}}>Recurso</th>
                  <th scope="col">Grátis</th>
                  <th scope="col" style={{color: '#22c55e'}}>PRO</th>
                  <th scope="col" style={{color: '#f59e0b'}}>Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className={styles.featName}>Anúncios ativos</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillFree}`}>{free.max_ads}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.max_ads}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>Ilimitado</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>Fotos por anúncio</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillFree}`}>{free.max_photos}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.max_photos}</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{premium.max_photos}</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Vídeo no anúncio</span>
                    <span className={styles.featDesc}>Upload de vídeo demonstração</span>
                  </td>
                  <td>{free.has_video ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{pro.has_video ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{premium.has_video ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Selo Verificado</span>
                    <span className={styles.featDesc}>Aumenta a confiança do comprador</span>
                  </td>
                  <td>{hasSelo(free) ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{hasSelo(pro) ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{hasSelo(premium) ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Destaques na Home</span>
                    <span className={styles.featDesc}>Anúncios em posição privilegiada</span>
                  </td>
                  <td><span className={styles.tblCross} aria-hidden="true">✕</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.highlight_count}/mês</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{premium.highlight_count}/mês</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Banner de perfil</span>
                    <span className={styles.featDesc}>Sua marca em destaque no perfil</span>
                  </td>
                  <td>{free.has_banner ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{pro.has_banner ? <span className={styles.tblCheck} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                  <td>{premium.has_banner ? <span className={styles.tblGold} aria-hidden="true">✓</span> : <span className={styles.tblCross} aria-hidden="true">✕</span>}</td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>Suporte</span></td>
                  <td>{getSuporte(free)}</td>
                  <td>{getSuporte(pro)}</td>
                  <td><span className={styles.tblGold}>{getSuporte(premium)}</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Análise de desempenho</span>
                    <span className={styles.featDesc}>Visualizações, cliques, conversões</span>
                  </td>
                  <td><span className={styles.tblCross} aria-hidden="true">✕</span></td>
                  <td>Básica</td>
                  <td><span className={styles.tblGold}>Avançada</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>Participação em Leilões</span></td>
                  <td><span className={styles.tblCheck} aria-hidden="true">✓</span></td>
                  <td><span className={styles.tblCheck} aria-hidden="true">✓</span></td>
                  <td><span className={styles.tblGold} aria-hidden="true">✓</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>Preço</span></td>
                  <td><strong style={{color: '#818cf8'}}>{free.price <= 0 ? 'Grátis' : 'R$'+free.price+'/mês'}</strong></td>
                  <td><strong style={{color: '#22c55e'}}>R${pro.price}/mês</strong></td>
                  <td><strong style={{color: '#f59e0b'}}>R${premium.price}/mês</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section className={styles.faqSection}>
          <h2>Perguntas Frequentes</h2>
          <FAQItem 
            id="cancelamento"
            question="Como faço para cancelar minha assinatura?" 
            answer="Você pode cancelar a qualquer momento pelo seu painel, na aba 'Assinatura'. O acesso ao plano continua até o fim do período pago. Não há multa ou fidelidade." 
          />
          <FAQItem 
            id="mudanca-plano"
            question="Posso mudar de plano no meio do mês?" 
            answer="Sim! Você pode fazer upgrade ou downgrade a qualquer momento. No upgrade, o valor é cobrado de forma proporcional (pro-rata). No downgrade, a mudança ocorre no próximo ciclo." 
          />
          <FAQItem 
            id="pagamento"
            question="Quais formas de pagamento são aceitas?" 
            answer="Aceitamos cartão de crédito, débito, Pix e boleto bancário." 
          />
          <FAQItem 
            id="anuncios-cancelamento"
            question="Meus anúncios somem se eu cancelar?" 
            answer="Não. Seus anúncios continuam visíveis, mas voltam ao limite do plano Grátis (3 ativos). Os demais ficam pausados automaticamente." 
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
