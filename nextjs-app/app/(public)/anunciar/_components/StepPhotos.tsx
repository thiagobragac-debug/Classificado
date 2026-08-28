'use client'

import React, { useRef, useState, useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { ImagePlus, X, Loader2, Video, Lock } from 'lucide-react'
import styles from '../page.module.css'
import { AnuncioFormValues } from './schema'
import { uploadAdImage, uploadAdVideo, getSupabase, getSession } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useLang } from '@/lib/lang-context'
import type { Lang } from '@/lib/constants'

interface StepPhotosProps {
  onPrev: () => void;
  isSubmitting: boolean;
}

// Strings exclusivas deste passo do wizard — padrão local de TRANSLATIONS,
// igual components/ads/AdsSidebar.tsx.
const TRANSLATIONS = {
  pt: {
    header: 'Fotos do Anúncio',
    headerDesc: (max: number) => `Adicione até ${max} fotos. Anúncios com fotos recebem 5x mais contatos.`,
    dropZoneAria: 'Clique ou arraste fotos aqui',
    uploadingPhotos: (n: number) => `Enviando ${n} foto(s)...`,
    clickToSelect: 'Clique para selecionar',
    orDrag: 'ou arraste fotos aqui',
    formatsInfo: (max: number) => `JPEG, PNG, WebP — Máximo de ${max} imagens, 10 MB cada`,
    addedCount: (n: number, max: number) => `${n} de ${max} adicionadas`,
    cover: 'CAPA',
    makeCover: 'Tornar Capa',
    removePhotoAria: 'Remover foto',
    previewAlt: 'Prévia',
    videoSection: 'Vídeo do anúncio (opcional)',
    videoLocked: 'Vídeo no anúncio é um recurso dos planos PRO e Premium.',
    upgrade: 'Fazer upgrade',
    removeVideo: 'Remover vídeo',
    chooseVideoAria: 'Clique para escolher um vídeo',
    uploadingVideo: 'Enviando vídeo...',
    clickChooseVideo: 'Clique para escolher um vídeo',
    videoFormats: 'MP4 ou WebM, máximo 50 MB',
    reviewNote: 'Seu anúncio ficará disponível após revisão em até 24h.',
    back: 'Voltar',
    publishing: 'Publicando...',
    publish: 'Publicar Anúncio',
    videoTypeError: 'Envie um arquivo de vídeo (mp4 ou webm).',
    videoSizeError: 'O vídeo deve ter no máximo 50 MB.',
    loginRequiredForMedia: 'Você precisa estar logado para enviar fotos ou vídeo. Faça login e continue de onde parou.',
    photoUploadError: (name: string, msg: string) => `Erro ao fazer upload da imagem ${name}: ${msg}`,
    videoUploadError: (msg: string) => `Erro ao fazer upload do vídeo: ${msg}`,
    planLimitsWarning: 'Não foi possível confirmar os limites do seu plano agora. Os valores exibidos podem estar incorretos — recarregue a página.',
  },
  es: {
    header: 'Fotos del Anuncio',
    headerDesc: (max: number) => `Agrega hasta ${max} fotos. Los anuncios con fotos reciben 5 veces más contactos.`,
    dropZoneAria: 'Haz clic o arrastra fotos aquí',
    uploadingPhotos: (n: number) => `Subiendo ${n} foto(s)...`,
    clickToSelect: 'Haz clic para seleccionar',
    orDrag: 'o arrastra fotos aquí',
    formatsInfo: (max: number) => `JPEG, PNG, WebP — Máximo de ${max} imágenes, 10 MB cada una`,
    addedCount: (n: number, max: number) => `${n} de ${max} agregadas`,
    cover: 'PORTADA',
    makeCover: 'Hacer Portada',
    removePhotoAria: 'Eliminar foto',
    previewAlt: 'Vista previa',
    videoSection: 'Video del anuncio (opcional)',
    videoLocked: 'El video en el anuncio es una función de los planes PRO y Premium.',
    upgrade: 'Mejorar plan',
    removeVideo: 'Eliminar video',
    chooseVideoAria: 'Haz clic para elegir un video',
    uploadingVideo: 'Subiendo video...',
    clickChooseVideo: 'Haz clic para elegir un video',
    videoFormats: 'MP4 o WebM, máximo 50 MB',
    reviewNote: 'Tu anuncio estará disponible después de la revisión en hasta 24h.',
    back: 'Volver',
    publishing: 'Publicando...',
    publish: 'Publicar Anuncio',
    videoTypeError: 'Envía un archivo de video (mp4 o webm).',
    videoSizeError: 'El video debe tener un máximo de 50 MB.',
    loginRequiredForMedia: 'Necesitas iniciar sesión para subir fotos o video. Inicia sesión y continúa donde lo dejaste.',
    photoUploadError: (name: string, msg: string) => `Error al subir la imagen ${name}: ${msg}`,
    videoUploadError: (msg: string) => `Error al subir el video: ${msg}`,
    planLimitsWarning: 'No fue posible confirmar los límites de tu plan ahora. Los valores mostrados pueden ser incorrectos — recarga la página.',
  },
} as const

// GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): o limite de
// fotos era um "6" fixo no código, igual pra todo mundo — Grátis (vendido
// como 5) ganhava 1 a mais, PRO (15) e Premium (30) recebiam bem menos do
// que pagavam. Busca o valor real do plano do usuário, mesma fonte que o
// trigger enforce_ad_media_plan_limits usa no banco (o teto real).
function usePlanMediaLimits(lang: Lang) {
  const [limits, setLimits] = useState<{ maxPhotos: number; hasVideo: boolean; loaded: boolean }>({ maxPhotos: 5, hasVideo: false, loaded: false })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const session = await getSession()
      if (!session) return
      const sb = getSupabase()
      const { data: secrets, error: secretsErr } = await sb.from('user_secrets').select('plan_id').eq('id', session.user.id).maybeSingle()
      let planRow: { max_photos: number; has_video: boolean } | null = null
      let lookupErr = secretsErr
      if (secrets?.plan_id) {
        const { data, error } = await sb.from('plans').select('max_photos, has_video').eq('id', secrets.plan_id).maybeSingle()
        planRow = data
        lookupErr = lookupErr || error
      }
      if (!planRow) {
        const { data, error } = await sb.from('plans').select('max_photos, has_video').eq('is_active', true).eq('price', 0).order('sort_order').limit(1).maybeSingle()
        planRow = data
        lookupErr = lookupErr || error
      }
      if (cancelled) return
      if (planRow) {
        setLimits({ maxPhotos: planRow.max_photos, hasVideo: planRow.has_video, loaded: true })
      } else {
        // BUG CORRIGIDO (validação de 2026-08-26): se as duas consultas
        // falhassem (rede/RLS/timeout), `loaded` nunca virava true e o
        // componente travava pra sempre no fallback do plano Grátis (5
        // fotos, sem vídeo) — um usuário PRO/Premium via os limites
        // errados sem nenhum aviso. Se o usuário TEM plano pago
        // (secrets.plan_id preenchido) e mesmo assim a busca falhou,
        // avisa explicitamente em vez de mentir com o valor do Grátis.
        console.error('[StepPhotos] Falha ao buscar limites do plano:', lookupErr?.message)
        if (secrets?.plan_id) {
          showToast(TRANSLATIONS[lang].planLimitsWarning, 'warning')
        }
        setLimits({ maxPhotos: 5, hasVideo: false, loaded: true })
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return limits
}

export function StepPhotos({ onPrev, isSubmitting }: StepPhotosProps) {
  const { setValue, watch, getValues, formState: { errors } } = useFormContext<AnuncioFormValues>()
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const fotos = watch('fotos') || []
  const video = watch('video')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const { maxPhotos, hasVideo } = usePlanMediaLimits(lang)

  const compressImage = (file: File, maxPx = 1280, quality = 0.82): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const img = new Image()
        img.onload = () => {
          let w = img.width, h = img.height
          if (w > maxPx || h > maxPx) {
            if (w >= h) { h = Math.round(h * (maxPx / w)); w = maxPx }
            else { w = Math.round(w * (maxPx / h)); h = maxPx }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(file)
          
          const isPng = file.type === 'image/png'
          if (!isPng) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h) }
          ctx.drawImage(img, 0, 0, w, h)
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.font = `bold ${Math.max(16, w * 0.04)}px sans-serif`
          ctx.textAlign = 'right'
          ctx.textBaseline = 'bottom'
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 4
          ctx.shadowOffsetX = 1
          ctx.shadowOffsetY = 1
          ctx.fillText('Tauze Class', w - (w * 0.02), h - (h * 0.02))
          
          const mime = isPng ? 'image/png' : 'image/jpeg'
          canvas.toBlob((blob) => {
            if (!blob || blob.size >= file.size) return resolve(file)
            resolve(new File([blob], file.name, { type: mime, lastModified: Date.now() }))
          }, mime, quality)
        }
        img.onerror = () => resolve(file)
        if (ev.target?.result) img.src = ev.target.result as string
      }
      reader.onerror = () => resolve(file)
      reader.readAsDataURL(file)
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    // BUG CORRIGIDO (varredura cruzada de cenários): "Progressive Profiling"
    // deixa visitante deslogado chegar até o Passo 3 (Fotos), mas o upload
    // não tinha guarda de sessão — uploadAdImage() lança um Error cru em
    // inglês ("Not authenticated") que o catch abaixo concatenava direto no
    // toast localizado, misturando idiomas. Checa a sessão ANTES de tentar
    // qualquer upload, com um aviso traduzido em vez de deixar a chamada de
    // rede falhar.
    const session = await getSession()
    if (!session) {
      showToast(tr.loginRequiredForMedia, 'error')
      return
    }
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))

    const availableSlots = maxPhotos - fotos.length
    const toProcess = valid.slice(0, availableSlots)

    if (toProcess.length > 0) {
      setUploadingCount(prev => prev + toProcess.length)
      
      for (const file of toProcess) {
        try {
          const compressed = await compressImage(file)
          const url = await uploadAdImage(compressed, 'draft')
          if (url) {
            // Get latest fotos from form state to avoid race conditions in loop
            const prev = getValues('fotos') || [];
            if (prev.length < maxPhotos) {
               setValue('fotos', [...prev, url], { shouldValidate: true })
            }
          }
        } catch (err: any) {
          showToast(tr.photoUploadError(file.name, err.message), 'error')
        } finally {
          setUploadingCount(prev => Math.max(0, prev - 1))
        }
      }
    }
  }

  const handleVideoFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const session = await getSession()
    if (!session) {
      showToast(tr.loginRequiredForMedia, 'error')
      return
    }
    if (!file.type.startsWith('video/')) {
      showToast(tr.videoTypeError, 'error')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast(tr.videoSizeError, 'error')
      return
    }
    setUploadingVideo(true)
    try {
      const url = await uploadAdVideo(file, 'draft')
      if (url) setValue('video', url, { shouldValidate: true })
    } catch (err: any) {
      showToast(tr.videoUploadError(err.message), 'error')
    } finally {
      setUploadingVideo(false)
    }
  }

  const removeVideo = () => setValue('video', '', { shouldValidate: true })

  const removeFile = (index: number) => {
    const newFotos = [...fotos]
    newFotos.splice(index, 1)
    setValue('fotos', newFotos, { shouldValidate: true })
  }

  const makeCover = (index: number) => {
    if (index === 0) return
    const newFotos = [...fotos]
    const [selected] = newFotos.splice(index, 1)
    newFotos.unshift(selected)
    setValue('fotos', newFotos, { shouldValidate: true })
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!isBusy && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // BUG CORRIGIDO (varredura cruzada de cenários): uploadingVideo nunca
  // entrava em isBusy — clicar em "Publicar Anúncio" enquanto um vídeo
  // ainda estava subindo submetia o formulário com o valor ANTERIOR (quase
  // sempre vazio) do campo video, perdendo o upload em andamento sem
  // nenhum aviso.
  const isBusy = uploadingCount > 0 || uploadingVideo || isSubmitting;

  return (
    <div className={styles.formSection}>
      <div className={styles.formSectionHeader}>
        <div className={styles.sectionIcon}>
          <ImagePlus size={24} />
        </div>
        <div>
          <h2>{tr.header}</h2>
          <p>{tr.headerDesc(maxPhotos)}</p>
        </div>
      </div>

      <div
        className={`${styles.photoUploadZone} ${isBusy ? styles.disabled : ''} ${isDragging ? styles.dragOver : ''}`}
        role="button"
        tabIndex={0}
        aria-label={tr.dropZoneAria}
        onClick={() => !isBusy && fileInputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !isBusy && fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
        <div className={styles.uploadIcon}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
        </div>
        <div>
          {uploadingCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" size={20} />
              <strong style={{ color: 'var(--clr-primary)', fontSize: '1.1rem' }}>{tr.uploadingPhotos(uploadingCount)}</strong>
            </div>
          ) : (
            <>
              <strong style={{ color: 'var(--clr-primary)', fontSize: '1.1rem' }}>{tr.clickToSelect}</strong> {tr.orDrag}
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.88rem', margin: '0.5rem 0' }}>{tr.formatsInfo(maxPhotos)}</p>
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.8rem', margin: 0, fontWeight: 700 }}>{tr.addedCount(fotos.length, maxPhotos)}</p>
            </>
          )}
        </div>
      </div>
      
      {fotos.length > 0 && (
        <div className={styles.photoPreviews}>
          {fotos.map((url, idx) => (
            <div key={idx} className={styles.photoThumb}>
              <img src={url} alt={tr.previewAlt} />
              {idx === 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--clr-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '0.25rem' }}>
                  {tr.cover}
                </div>
              )}
              {idx > 0 && (
                <button type="button" className={styles.coverBtn} onClick={(e) => { e.stopPropagation(); makeCover(idx); }} style={{ position: 'absolute', bottom: 6, left: 6, right: 6, background: 'rgba(255,255,255,0.9)', color: 'var(--clr-text)', fontSize: '0.75rem', fontWeight: 700, border: 'none', padding: '0.2rem', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                  {tr.makeCover}
                </button>
              )}
              <button type="button" className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); removeFile(idx); }} aria-label={tr.removePhotoAria}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {errors.fotos && <span className={styles.errorText} style={{ marginTop: '1rem', fontWeight: 500 }}>{errors.fotos.message}</span>}

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--clr-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <Video size={20} />
          <strong>{tr.videoSection}</strong>
        </div>
        {!hasVideo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1rem', background: 'var(--clr-surface-alt, #f8fafc)', borderRadius: '0.6rem', color: 'var(--clr-muted)', fontSize: '0.88rem' }}>
            <Lock size={16} />
            {tr.videoLocked} <a href="/planos" style={{ color: 'var(--clr-primary)', fontWeight: 600 }}>{tr.upgrade}</a>
          </div>
        ) : video ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <video src={video} controls style={{ width: 220, borderRadius: '0.6rem' }} />
            <button type="button" className={styles.btnOutline} onClick={removeVideo} style={{ padding: '0.5rem 1rem' }}>{tr.removeVideo}</button>
          </div>
        ) : (
          <div
            className={styles.photoUploadZone}
            role="button"
            tabIndex={0}
            aria-label={tr.chooseVideoAria}
            onClick={() => !uploadingVideo && videoInputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploadingVideo && videoInputRef.current?.click()}
          >
            <input type="file" ref={videoInputRef} accept="video/mp4,video/webm" onChange={e => handleVideoFile(e.target.files)} style={{ display: 'none' }} />
            {uploadingVideo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={20} />
                <strong>{tr.uploadingVideo}</strong>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.9rem' }}>
                <strong style={{ color: 'var(--clr-primary)' }}>{tr.clickChooseVideo}</strong> — {tr.videoFormats}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={styles.wizardActions}>
        <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={onPrev} style={{ padding: '0.8rem 2rem' }} disabled={isBusy}>{tr.back}</button>
        <button type="submit" className="btn btn--accent btn--lg" disabled={isBusy}>
          {isSubmitting ? tr.publishing : tr.publish}
        </button>
      </div>
      <p style={{ textAlign: 'right', fontSize: '.82rem', color: 'var(--clr-muted)', margin: 0, paddingTop: '1rem' }}>
        {tr.reviewNote}
      </p>
    </div>
  )
}
