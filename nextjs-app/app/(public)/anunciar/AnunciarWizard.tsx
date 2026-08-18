'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'

import { createAd, updateAd } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import styles from './page.module.css'
import { AnuncioSchema, AnuncioFormValues, InsertAdDTO } from './_components/schema'
import { StepData } from './_components/StepData'

// Lazy load steps that are not immediately visible
const StepLocation = dynamic(() => import('./_components/StepLocation').then(m => m.StepLocation), {
  loading: () => (
    <div className={styles.skeletonContainer}>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonGrid}>
        <div className={styles.skeletonField} />
        <div className={styles.skeletonField} />
        <div className={styles.skeletonField} />
      </div>
    </div>
  )
})

const StepPhotos = dynamic(() => import('./_components/StepPhotos').then(m => m.StepPhotos), {
  loading: () => (
    <div className={styles.skeletonContainer}>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonField} style={{ height: '150px' }} />
    </div>
  )
})

interface AnunciarWizardProps {
  initialData: any | null; // Ad data if editing or existing draft
  userProfile: any | null; // User profile for default location
  isEditMode: boolean;
}

export function AnunciarWizard({ initialData, userProfile, isEditMode }: AnunciarWizardProps) {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string>('idle')
  const [draftId, setDraftId] = useState<string | null>(initialData?.id || null)
  const draftTimer = useRef<NodeJS.Timeout | null>(null)

  const methods = useForm<AnuncioFormValues>({
    resolver: zodResolver(AnuncioSchema),
    defaultValues: {
      titulo: initialData?.title_pt || '',
      categoria: initialData?.category_id || '',
      descricao: initialData?.description || '',
      moeda: initialData?.currency || 'BRL',
      preco: initialData?.price ? initialData.price.toString() : '',
      aNegociar: initialData?.negotiable || false,
      unidadePreco: initialData?.price_unit_pt || '',
      condicao: initialData?.condition || '',
      pais: initialData?.country || userProfile?.country || 'Brasil',
      estado: initialData?.state || userProfile?.state || '',
      cidade: initialData?.city || userProfile?.city || '',
      fotos: initialData?.images || []
    }
  })

  const { handleSubmit, watch, getValues, reset } = methods

  useEffect(() => {
    // Progressive Profiling: check for local draft if no initialData
    if (!initialData && !isEditMode) {
      const localDraft = localStorage.getItem('tc_draft_ad');
      if (localDraft) {
        try {
          const stored = JSON.parse(localDraft);
          // Verificar expiração: rascunho dura no máximo 24h em dispositivos compartilhados
          if (stored.expires && stored.expires < Date.now()) {
            localStorage.removeItem('tc_draft_ad');
            return;
          }
          const parsed = stored.data || stored; // compatibilidade com formato antigo
          // Restore form values
          reset({
            titulo: parsed.title_pt || '',
            categoria: parsed.category_id || '',
            descricao: parsed.description || '',
            moeda: parsed.currency || 'BRL',
            preco: parsed.price ? parsed.price.toString() : '',
            aNegociar: parsed.negotiable || false,
            unidadePreco: parsed.price_unit_pt || '',
            condicao: parsed.condition || '',
            pais: parsed.country || userProfile?.country || 'Brasil',
            estado: parsed.state || userProfile?.state || '',
            cidade: parsed.city || userProfile?.city || '',
            fotos: parsed.images || []
          });
          // Após carregar, remover para não recarregar se o usuário começar novamente
          localStorage.removeItem('tc_draft_ad');
          showToast('Rascunho recuperado. Você pode continuar de onde parou.', 'info');
        } catch(e) {
          // Draft corrompido — limpar
          localStorage.removeItem('tc_draft_ad');
          console.error('Error parsing local draft', e);
        }
      }
    }
  }, [initialData, isEditMode, reset, userProfile]);

  // Prevent accidental tab closing when saving or submitting
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmitting || saveStatus === 'saving') {
        e.preventDefault()
        e.returnValue = '' // Required for legacy browsers
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSubmitting, saveStatus])

  // Watch for form changes to trigger debounced auto-save
  useEffect(() => {
    if (isEditMode && initialData?.status !== 'draft') return; // Don't auto-save active ads as draft

    const subscription = watch((value, { name, type }) => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      
      setSaveStatus('saving')
      
      draftTimer.current = setTimeout(async () => {
        try {
          const values = getValues()
          // Only save if basic info is present to avoid junk records
          if (values.titulo.length > 3 && values.categoria) {
            const payload = preparePayload(values, 'draft')
            
            const { getSupabase } = await import('@/lib/supabase');
            const { data: { session } } = await getSupabase().auth.getSession();

            if (!session) {
              // Progressive profiling: salvar com expiração de 24h
              const draftWithExpiry = {
                data: payload,
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 horas
              };
              localStorage.setItem('tc_draft_ad', JSON.stringify(draftWithExpiry));
              setSaveStatus('saved');
              return;
            }

            if (draftId) {
              await updateAd(draftId, payload)
            } else {
              const newDraft = await createAd(payload)
              setDraftId(newDraft.id)
            }
            setSaveStatus('saved')
          } else {
            setSaveStatus('idle')
          }
        } catch (e: any) {
          console.error("Erro ao salvar rascunho em background", e)
          setSaveStatus(e.message || 'error')
          
          // Prevenção contra spoofing/falha RLS: se não tem permissão para alterar este draft, limpa o ID
          if (e.code === '403' || e.message?.includes('RLS') || e.code === '42501') {
            setDraftId(null)
            showToast('Erro de permissão no rascunho. Reiniciando novo.', 'error')
          }
        }
      }, 1500)
    })
    return () => subscription.unsubscribe()
  }, [watch, draftId, isEditMode, initialData, getValues])


  const preparePayload = (data: AnuncioFormValues, status: InsertAdDTO['status']): InsertAdDTO => {
    const finalCategoryId = data.categoria;

    let parsedPrice = null;
    if (data.preco) {
      let clean = String(data.preco).replace(/[^\d.,]/g, '').replace(',', '.');
      const num = parseFloat(clean);
      if (!isNaN(num)) parsedPrice = num;
    }

    return {
      title_pt: data.titulo,
      description: data.descricao,
      category_id: finalCategoryId,
      price: parsedPrice,
      currency: data.moeda,
      price_unit_pt: data.unidadePreco || null,
      country: data.pais,
      state: data.estado,
      city: data.cidade,
      negotiable: data.aNegociar,
      condition: data.condicao || null,
      status: status,
      images: data.fotos
    }
  }

  const onSubmit = async (data: AnuncioFormValues) => {
    setIsSubmitting(true)
    
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const { data: { session } } = await getSupabase().auth.getSession();
      
      const payload = preparePayload(data, 'pending') // goes to pending for review

      if (!session) {
        // Progressive Profiling: Require login before final publish
        const draftWithExpiry = {
          data: payload,
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 horas
        };
        localStorage.setItem('tc_draft_ad', JSON.stringify(draftWithExpiry));
        showToast('Quase lá! Faça login ou cadastre-se para publicar seu anúncio.', 'info');
        router.push('/login?redirectTo=/anunciar');
        return;
      }

      if (draftId || isEditMode) {
        await updateAd(draftId || (initialData?.id), payload)
      } else {
        await createAd(payload)
      }
      
      showToast('Anúncio enviado com sucesso!', 'success')
      router.push('/painel?success=1')
    } catch (err: any) {
      showToast(err.message || 'Erro ao publicar o anúncio. Tente novamente.', 'error')
      setIsSubmitting(false)
    }
  }

  const stepVariants = {
    initial: (direction: number) => ({ opacity: 0, x: direction > 0 ? 20 : -20 }),
    in: { opacity: 1, x: 0 },
    out: (direction: number) => ({ opacity: 0, x: direction > 0 ? -20 : 20 })
  }

  const navigateToStep = (newStep: number) => {
    setDirection(newStep > currentStep ? 1 : -1)
    setCurrentStep(newStep)
  }

  return (
    <>
      <div className="list-hero" style={{ marginTop: 'var(--header-h)' }}>
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <Link href="/">Início</Link>
                <span aria-hidden="true">›</span>
                <span>Novo Anúncio</span>
              </nav>
              <h1 className="list-hero-title">
                {isEditMode ? 'Editar Anúncio' : 'Criar Anúncio'}
              </h1>
              <p className="list-hero-count">
                Preencha os dados abaixo e alcance milhares de compradores no agronegócio.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="container">
        <div className={styles.anunciarLayout}>
          
          <div className={styles.stepProgress} role="tablist" aria-label="Progresso do formulário">
            <button 
              type="button"
              className={`${styles.stepItem} ${currentStep >= 1 ? styles.active : ''}`}
              onClick={() => currentStep > 1 && navigateToStep(1)}
              disabled={currentStep < 1}
              aria-current={currentStep === 1 ? 'step' : undefined}
            >
              <div className={styles.stepNum}>1</div><span className={styles.stepLabel}>Dados do Anúncio</span>
            </button>
            <button 
              type="button"
              className={`${styles.stepItem} ${currentStep >= 2 ? styles.active : ''}`}
              onClick={() => currentStep > 2 && navigateToStep(2)}
              disabled={currentStep < 2}
              aria-current={currentStep === 2 ? 'step' : undefined}
            >
              <div className={styles.stepNum}>2</div><span className={styles.stepLabel}>Localização</span>
            </button>
            <button 
              type="button"
              className={`${styles.stepItem} ${currentStep >= 3 ? styles.active : ''}`}
              onClick={() => currentStep > 3 && navigateToStep(3)}
              disabled={currentStep < 3}
              aria-current={currentStep === 3 ? 'step' : undefined}
            >
              <div className={styles.stepNum}>3</div><span className={styles.stepLabel}>Fotos</span>
            </button>
          </div>
          
          <div className={`${styles.saveStatusContainer} ${saveStatus === 'saving' ? styles.saving : (saveStatus === 'saved' ? styles.saved : (saveStatus !== 'idle' ? styles.error : ''))}`} aria-live="polite">
            {saveStatus === 'saving' && <><span className={styles.spinner}></span> Salvando rascunho...</>}
            {saveStatus === 'saved' && <>Rascunho salvo</>}
            {saveStatus !== 'idle' && saveStatus !== 'saving' && saveStatus !== 'saved' && <>Erro ao salvar: {saveStatus}</>}
          </div>

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait" custom={direction}>
                {currentStep === 1 && (
                  <motion.div key="step1" custom={direction} variants={stepVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.3 }}>
                    <StepData onNext={() => navigateToStep(2)} />
                  </motion.div>
                )}
                {currentStep === 2 && (
                  <motion.div key="step2" custom={direction} variants={stepVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.3 }}>
                    <StepLocation onNext={() => navigateToStep(3)} onPrev={() => navigateToStep(1)} />
                  </motion.div>
                )}
                {currentStep === 3 && (
                  <motion.div key="step3" custom={direction} variants={stepVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.3 }}>
                    <StepPhotos onPrev={() => navigateToStep(2)} isSubmitting={isSubmitting} />
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </FormProvider>
        </div>
      </main>
    </>
  )
}
