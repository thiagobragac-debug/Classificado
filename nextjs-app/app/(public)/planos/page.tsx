'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import CheckoutModal from '@/components/ui/CheckoutModal'
import styles from './page.module.css'

function FAQItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}>
      <button className={styles.faqQ} onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}>
        {question} <span className={styles.faqArrow}>▾</span>
      </button>
      <div className={styles.faqA}>
        <p>{answer}</p>
      </div>
    </div>
  )
}

export default function PlanosPage() {
  const router = useRouter()
  const { session } = useAuth()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userPlanId, setUserPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    async function fetchPlans() {
      const sb = getSupabase()
      try {
        const { data } = await sb.from('plans').select('*').eq('is_active', true).order('sort_order')
        if (data) setPlans(data)

        if (session) {
          const { data: profile } = await sb.from('profiles').select('plan_id').eq('id', session.user.id).single()
          if (profile) setUserPlanId(profile.plan_id)
        }
      } catch (err) {
        console.error('Erro ao buscar planos:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [session])

  const handlePlanClick = (plan: any) => {
    if (!session) {
      router.push('/login?redirect=/planos')
      return
    }

    if (plan.price <= 0) {
      if (confirm('Tem certeza que deseja mudar para o plano Grátis?')) {
        alert('Downgrade não implementado completamente nesta simulação.')
      }
    } else {
      setSelectedPlan(plan)
    }
  }

  const free = plans.find(p => p.sort_order === 1) || {}
  const pro = plans.find(p => p.sort_order === 2) || {}
  const premium = plans.find(p => p.sort_order === 3) || {}

  const hasSelo = (p: any) => {
    try {
      const f = typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || [])
      return f.some((feat: string) => feat.toLowerCase().includes('selo'))
    } catch { return false }
  }

  const getSuporte = (p: any) => {
    try {
      const f = typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || [])
      const sup = f.find((feat: string) => feat.toLowerCase().includes('suporte'))
      return sup ? sup.replace('Suporte por', '').replace('Suporte prioritário', '').replace('Suporte', '').trim() : 'Email'
    } catch { return 'Email' }
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem' }}>
            <span style={{ fontWeight: billingCycle === 'monthly' ? 700 : 500, color: billingCycle === 'monthly' ? '#fff' : 'rgba(255,255,255,0.7)', transition: 'all 0.2s' }}>Mensal</span>
            <div 
              style={{ width: '60px', height: '32px', background: billingCycle === 'monthly' ? 'rgba(255,255,255,0.2)' : '#10b981', borderRadius: '32px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}
              onClick={() => setBillingCycle(c => c === 'monthly' ? 'annual' : 'monthly')}
            >
              <div style={{ width: '24px', height: '24px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '4px', left: billingCycle === 'monthly' ? '4px' : '32px', transition: 'left 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
            </div>
            <span style={{ fontWeight: billingCycle === 'annual' ? 700 : 500, color: billingCycle === 'annual' ? '#fff' : 'rgba(255,255,255,0.7)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Anual
              <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '12px' }}>-20%</span>
            </span>
          </div>
        </div>
      </section>

      <main className="container" style={{ position: 'relative', zIndex: 10 }}>
        
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--clr-text-muted)' }}>Carregando planos...</p>
        ) : (
          <div className={styles.pricingGrid}>
            {plans.map(plan => {
              const isFree = plan.price <= 0
              const isCurrent = userPlanId === plan.id
              const isPopular = plan.sort_order === 2

              let featuresList: string[] = []
              try {
                featuresList = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || [])
              } catch(e) {}

              return (
                <div key={plan.id} className={`${styles.pricingCard} ${isPopular ? styles.popular : ''}`}>
                  {isPopular && <div className={styles.popularBadge}>⭐ Mais Popular</div>}
                  {isCurrent && <div className={styles.currentBadge}>✓ Plano Atual</div>}
                  
                  <div className={styles.planHeader}>
                    <h3>{plan.name_pt || plan.name}</h3>
                    <p>{plan.description || ''}</p>
                    
                    {isFree ? (
                      <div className={styles.freePrice}><span className={styles.amount}>Grátis</span></div>
                    ) : (
                      <div className={styles.proPrice}>
                        <span className={styles.currency}>{plan.currency === 'BRL' ? 'R$' : plan.currency}</span>
                        <span className={styles.amount}>
                          {billingCycle === 'monthly' ? plan.price : (plan.price * 0.8).toFixed(2).replace('.', ',')}
                        </span>
                        <span className={styles.period}>/mês</span>
                      </div>
                    )}
                    {billingCycle === 'annual' && !isFree && (
                      <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 700, marginTop: '0.25rem' }}>Faturado anualmente (20% OFF)</div>
                    )}
                  </div>
                  
                  <ul className={styles.planFeatures}>
                    <li><span className={styles.featCheck}>✓</span> {plan.max_ads >= 9999 ? 'Anúncios Ilimitados' : `${plan.max_ads} anúncios ativos`}</li>
                    <li><span className={styles.featCheck}>✓</span> Até {plan.max_photos} fotos por anúncio</li>
                    {plan.highlight_count > 0 && (
                      <li><span className={styles.featCheck}>✓</span> {plan.highlight_count} destaques mensais</li>
                    )}
                    {featuresList.map((f, i) => (
                      <li key={i}><span className={styles.featCheck}>✓</span> {f}</li>
                    ))}
                  </ul>
                  
                  <button 
                    className={`${styles.btnPlan} ${isFree ? styles.btnFree : (isPopular ? styles.btnPro : styles.btnPremium)} ${isCurrent ? styles.btnCurrent : ''}`}
                    disabled={isCurrent}
                    onClick={() => handlePlanClick(plan)}
                  >
                    {isCurrent ? 'Plano Atual' : (isFree ? (userPlanId ? 'Fazer Downgrade' : 'Começar Grátis') : 'Assinar')}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* COMPARISON TABLE */}
        <section className={styles.compareSection}>
          <h2>Comparação Completa</h2>
          <p className={styles.compareSub}>Tudo que cada plano inclui, sem surpresas.</p>
          
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th style={{textAlign: 'left'}}>Recurso</th>
                  <th>Grátis</th>
                  <th style={{color: '#22c55e'}}>PRO</th>
                  <th style={{color: '#f59e0b'}}>Premium</th>
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
                  <td>{free.has_video ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{pro.has_video ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{premium.has_video ? <span className={styles.tblGold}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Selo Verificado</span>
                    <span className={styles.featDesc}>Aumenta a confiança do comprador</span>
                  </td>
                  <td>{hasSelo(free) ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{hasSelo(pro) ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{hasSelo(premium) ? <span className={styles.tblGold}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Destaques na Home</span>
                    <span className={styles.featDesc}>Anúncios em posição privilegiada</span>
                  </td>
                  <td><span className={styles.tblCross}>✕</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPro}`}>{pro.highlight_count}/mês</span></td>
                  <td><span className={`${styles.tblPill} ${styles.pillPremium}`}>{premium.highlight_count}/mês</span></td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.featName}>Banner de perfil</span>
                    <span className={styles.featDesc}>Sua marca em destaque no perfil</span>
                  </td>
                  <td>{free.has_banner ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{pro.has_banner ? <span className={styles.tblCheck}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
                  <td>{premium.has_banner ? <span className={styles.tblGold}>✓</span> : <span className={styles.tblCross}>✕</span>}</td>
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
                  <td><span className={styles.tblCross}>✕</span></td>
                  <td>Básica</td>
                  <td><span className={styles.tblGold}>Avançada</span></td>
                </tr>
                <tr>
                  <td><span className={styles.featName}>Participação em Leilões</span></td>
                  <td><span className={styles.tblCheck}>✓</span></td>
                  <td><span className={styles.tblCheck}>✓</span></td>
                  <td><span className={styles.tblGold}>✓</span></td>
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
            question="Como faço para cancelar minha assinatura?" 
            answer="Você pode cancelar a qualquer momento pelo seu painel, na aba 'Assinatura'. O acesso ao plano continua até o fim do período pago. Não há multa ou fidelidade." 
          />
          <FAQItem 
            question="Posso mudar de plano no meio do mês?" 
            answer="Sim! Você pode fazer upgrade ou downgrade a qualquer momento. No upgrade, o valor é cobrado de forma proporcional (pro-rata). No downgrade, a mudança ocorre no próximo ciclo." 
          />
          <FAQItem 
            question="Quais formas de pagamento são aceitas?" 
            answer="Aceitamos cartão de crédito, débito, Pix e boleto bancário." 
          />
          <FAQItem 
            question="Meus anúncios somem se eu cancelar?" 
            answer="Não. Seus anúncios continuam visíveis, mas voltam ao limite do plano Grátis (3 ativos). Os demais ficam pausados automaticamente." 
          />
        </section>
      </main>

      {selectedPlan && (
        <CheckoutModal 
          plan={selectedPlan} 
          onClose={() => setSelectedPlan(null)} 
        />
      )}
    </>
  )
}
