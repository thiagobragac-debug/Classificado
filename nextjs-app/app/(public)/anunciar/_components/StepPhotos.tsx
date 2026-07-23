'use client'

import React, { useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import styles from '../page.module.css'
import { AnuncioFormValues } from './schema'
import { uploadAdImage } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

interface StepPhotosProps {
  onPrev: () => void;
  isSubmitting: boolean;
}

export function StepPhotos({ onPrev, isSubmitting }: StepPhotosProps) {
  const { setValue, watch, formState: { errors } } = useFormContext<AnuncioFormValues>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const fotos = watch('fotos') || []
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

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
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))
    
    const availableSlots = 6 - fotos.length
    const toProcess = valid.slice(0, availableSlots)
    
    if (toProcess.length > 0) {
      setUploadingCount(prev => prev + toProcess.length)
      
      for (const file of toProcess) {
        try {
          const compressed = await compressImage(file)
          const url = await uploadAdImage(compressed, 'draft')
          if (url) {
            // Get latest fotos from form state to avoid race conditions in loop
            setValue('fotos', (prev: string[]) => {
               const curr = prev || [];
               if (curr.length < 6) return [...curr, url];
               return curr;
            }, { shouldValidate: true })
          }
        } catch (err: any) {
          showToast(`Erro ao fazer upload da imagem ${file.name}: ${err.message}`, 'error')
        } finally {
          setUploadingCount(prev => Math.max(0, prev - 1))
        }
      }
    }
  }

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

  const isBusy = uploadingCount > 0 || isSubmitting;

  return (
    <div className={styles.formSection}>
      <div className={styles.formSectionHeader}>
        <div className={styles.sectionIcon}>
          <ImagePlus size={24} />
        </div>
        <div>
          <h2>Fotos do Anúncio</h2>
          <p>Adicione até 6 fotos. Anúncios com fotos recebem 5x mais contatos.</p>
        </div>
      </div>
      
      <div 
        className={`${styles.photoUploadZone} ${isBusy ? styles.disabled : ''} ${isDragging ? styles.dragOver : ''}`} 
        onClick={() => !isBusy && fileInputRef.current?.click()}
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
              <strong style={{ color: 'var(--clr-primary)', fontSize: '1.1rem' }}>Enviando {uploadingCount} foto(s)...</strong>
            </div>
          ) : (
            <>
              <strong style={{ color: 'var(--clr-primary)', fontSize: '1.1rem' }}>Clique para selecionar</strong> ou arraste fotos aqui
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.88rem', margin: '0.5rem 0' }}>JPEG, PNG, WebP — Máximo de 6 imagens, 10 MB cada</p>
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.8rem', margin: 0, fontWeight: 700 }}>{fotos.length} de 6 adicionadas</p>
            </>
          )}
        </div>
      </div>
      
      {fotos.length > 0 && (
        <div className={styles.photoPreviews}>
          {fotos.map((url, idx) => (
            <div key={idx} className={styles.photoThumb}>
              <img src={url} alt="Preview" />
              {idx === 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--clr-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '0.25rem' }}>
                  CAPA
                </div>
              )}
              {idx > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); makeCover(idx); }} style={{ position: 'absolute', bottom: 6, left: 6, right: 6, background: 'rgba(255,255,255,0.9)', color: 'var(--clr-text)', fontSize: '0.75rem', fontWeight: 700, border: 'none', padding: '0.2rem', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                  Tornar Capa
                </button>
              )}
              <button type="button" className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); removeFile(idx); }} aria-label="Remover foto">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {errors.fotos && <span className={styles.errorText} style={{ marginTop: '1rem', fontWeight: 500 }}>{errors.fotos.message}</span>}

      <div className={styles.wizardActions}>
        <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={onPrev} style={{ padding: '0.8rem 2rem' }} disabled={isBusy}>Voltar</button>
        <button type="submit" className="btn btn--accent btn--lg" disabled={isBusy}>
          {isSubmitting ? 'Publicando...' : 'Publicar Anúncio'}
        </button>
      </div>
      <p style={{ textAlign: 'right', fontSize: '.82rem', color: 'var(--clr-muted)', margin: 0, paddingTop: '1rem' }}>
        Seu anúncio ficará disponível após revisão em até 24h.
      </p>
    </div>
  )
}
