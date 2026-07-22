'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import styles from './page.module.css'
import RichTextEditor from '@/components/RichTextEditor'
import { createAd, updateAd, uploadAdImage, getAdById, getSupabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'

// Fake categories for now, same as original data.js
const CATEGORIES = [
  { id: 'cat-bovinos', name: 'Bovinos' },
  { id: 'cat-equinos', name: 'Equinos' },
  { id: 'cat-suinos', name: 'Suínos' },
  { id: 'cat-maquinas', name: 'Máquinas Agrícolas' }
]

const BR_STATES: Record<string, string> = {
  'Acre': 'AC', 'AC': 'Acre',
  'Alagoas': 'AL', 'AL': 'Alagoas',
  'Amapá': 'AP', 'AP': 'Amapá',
  'Amazonas': 'AM', 'AM': 'Amazonas',
  'Bahia': 'BA', 'BA': 'Bahia',
  'Ceará': 'CE', 'CE': 'Ceará',
  'Distrito Federal': 'DF', 'DF': 'Distrito Federal',
  'Espírito Santo': 'ES', 'ES': 'Espírito Santo',
  'Goiás': 'GO', 'GO': 'Goiás',
  'Maranhão': 'MA', 'MA': 'Maranhão',
  'Mato Grosso': 'MT', 'MT': 'Mato Grosso',
  'Mato Grosso do Sul': 'MS', 'MS': 'Mato Grosso do Sul',
  'Minas Gerais': 'MG', 'MG': 'Minas Gerais',
  'Pará': 'PA', 'PA': 'Pará',
  'Paraíba': 'PB', 'PB': 'Paraíba',
  'Paraná': 'PR', 'PR': 'Paraná',
  'Pernambuco': 'PE', 'PE': 'Pernambuco',
  'Piauí': 'PI', 'PI': 'Piauí',
  'Rio de Janeiro': 'RJ', 'RJ': 'Rio de Janeiro',
  'Rio Grande do Norte': 'RN', 'RN': 'Rio Grande do Norte',
  'Rio Grande do Sul': 'RS', 'RS': 'Rio Grande do Sul',
  'Rondônia': 'RO', 'RO': 'Rondônia',
  'Roraima': 'RR', 'RR': 'Roraima',
  'Santa Catarina': 'SC', 'SC': 'Santa Catarina',
  'São Paulo': 'SP', 'SP': 'São Paulo',
  'Sergipe': 'SE', 'SE': 'Sergipe',
  'Tocantins': 'TO', 'TO': 'Tocantins',
};

function AnunciarForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editAdId = searchParams.get('id')
  const { session, loading } = useAuth()

  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form State
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [moeda, setMoeda] = useState('BRL')
  const [preco, setPreco] = useState('')
  const [aNegociar, setANegociar] = useState(false)
  const [unidadePreco, setUnidadePreco] = useState('')
  const [condicao, setCondicao] = useState('')
  
  const [pais, setPais] = useState('')
  const [estado, setEstado] = useState('')
  const [cidade, setCidade] = useState('')

  // Photos State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loading && !session) {
      router.push(`/login?redirect=/anunciar${editAdId ? `?id=${editAdId}` : ''}`)
    }
  }, [session, loading, router, editAdId])

  useEffect(() => {
    if (editAdId) {
      getAdById(editAdId).then((ad) => {
        if (ad) {
          setTitulo(ad.title_pt || '')
          setCategoria(ad.category_id ? ad.category_id.replace('cat-', '') : '')
          setDescricao(ad.description || '')
          setMoeda(ad.currency || 'BRL')
          setPreco(ad.price ? ad.price.toString() : '')
          setANegociar(ad.negotiable || false)
          setUnidadePreco(ad.price_unit_pt || '')
          setCondicao(ad.condition || '')
          setPais(ad.country || '')
          setEstado(ad.state || '')
          setCidade(ad.city || '')
        }
      })
    } else if (session) {
      // Auto-preencher localização a partir do perfil
      getSupabase().from('profiles').select('country, state, city').eq('id', session.user.id).single()
        .then(({ data }: { data: any }) => {
          if (data?.country) {
            let nc = data.country;
            if (nc.includes('Brasil') || nc === 'Brazil' || nc === 'BR') nc = 'Brasil';
            else if (nc.includes('Argentina')) nc = 'Argentina';
            else if (nc.includes('Uruguai')) nc = 'Uruguai';
            else if (nc.includes('Paraguai')) nc = 'Paraguai';
            
            setPais(nc)
            setEstado(data.state || '')
            setCidade(data.city || '')
          } else {
            // Fallback via IP sem pedir GPS bloqueante no carregamento
              fetch('https://ipapi.co/json/')
              .then(res => res.json())
              .then(d => {
                if (d.country_name) setPais(d.country_name === 'Brazil' ? 'Brasil' : d.country_name)
                if (d.region) {
                  const stateCode = BR_STATES[d.region] || d.region;
                  setEstado(stateCode.length === 2 ? stateCode : d.region);
                }
                if (d.city) setCidade(d.city)
              }).catch(() => {})
          }
        })
    }
  }, [editAdId, session])

  if (loading || !session) return null // ou loading spinner

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3))
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1))

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))
    setSelectedFiles(prev => {
      const newFiles = [...prev, ...valid]
      return newFiles.slice(0, 6)
    })
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    if (!titulo || !categoria || !pais || !estado || !cidade || !descricao) {
      setErrorMsg('Por favor, preencha todos os campos obrigatórios.')
      return
    }

    setIsSubmitting(true)
    try {
      const imageUrls: string[] = []
      if (selectedFiles.length > 0) {
        setUploadStatus('Otimizando fotos...')
        const compressed = []
        for (let i = 0; i < selectedFiles.length; i++) {
          setUploadProgress(Math.round(((i + 0.5) / selectedFiles.length) * 50))
          compressed.push(await compressImage(selectedFiles[i]))
        }
        
        for (let i = 0; i < compressed.length; i++) {
          setUploadStatus(`Enviando foto ${i + 1} de ${compressed.length}...`)
          setUploadProgress(50 + Math.round(((i + 1) / compressed.length) * 50))
          const url = await uploadAdImage(compressed[i], 'draft')
          if (url) imageUrls.push(url)
        }
      }

      const finalCategoryId = ['bovinos', 'equinos', 'suinos', 'maquinas'].includes(categoria) 
        ? `cat-${categoria}` 
        : categoria

      const payload: any = {
        title_pt: titulo,
        description: descricao,
        category_id: finalCategoryId,
        price: preco ? parseFloat(preco) : null,
        currency: moeda,
        price_unit_pt: unidadePreco || null,
        country: pais,
        state: estado,
        city: cidade,
        negotiable: aNegociar,
        condition: condicao || null,
        status: 'pending'
      }

      if (editAdId) {
        if (imageUrls.length > 0) payload.images = imageUrls
        await updateAd(editAdId, payload)
      } else {
        payload.images = imageUrls
        await createAd(payload)
      }
      router.push('/painel?success=1')
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const fetchLocation = async () => {
    const normalizeCountry = (nc: string) => {
      if (!nc) return '';
      if (nc.includes('Brasil') || nc === 'Brazil' || nc === 'BR') return 'Brasil';
      if (nc.includes('Argentina')) return 'Argentina';
      if (nc.includes('Uruguai')) return 'Uruguai';
      if (nc.includes('Paraguai')) return 'Paraguai';
      return nc;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          if (data.address.country) setPais(normalizeCountry(data.address.country))
          if (data.address.state) {
            const stateCode = BR_STATES[data.address.state] || data.address.state;
            setEstado(stateCode.length === 2 ? stateCode : data.address.state);
          }
          if (data.address.city || data.address.town) setCidade(data.address.city || data.address.town)
        } catch (e) {
          console.warn("Could not fetch location via OSM", e)
        }
      })
    } else {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        if (data.country_name) setPais(normalizeCountry(data.country_name))
        if (data.region) {
          const stateCode = BR_STATES[data.region] || data.region;
          setEstado(stateCode.length === 2 ? stateCode : data.region);
        }
        if (data.city) setCidade(data.city)
      } catch(e) {
        console.warn("Could not fetch location via IP", e)
      }
    }
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
                {editAdId ? 'Editar Anúncio' : 'Criar Anúncio'}
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
          
          <div className={styles.stepProgress} role="tablist">
            <div className={`${styles.stepItem} ${currentStep >= 1 ? styles.active : ''}`}>
              <div className={styles.stepNum}>1</div><span className={styles.stepLabel}>Dados do Anúncio</span>
            </div>
            <div className={`${styles.stepItem} ${currentStep >= 2 ? styles.active : ''}`}>
              <div className={styles.stepNum}>2</div><span className={styles.stepLabel}>Localização</span>
            </div>
            <div className={`${styles.stepItem} ${currentStep >= 3 ? styles.active : ''}`}>
              <div className={styles.stepNum}>3</div><span className={styles.stepLabel}>Fotos</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            
            {/* STEP 1: DADOS */}
            <div className={`${styles.stepPane} ${currentStep === 1 ? styles.active : ''}`}>
              <div className={styles.formSection}>
                <div className={styles.formSectionHeader}>
                  <div className={styles.sectionIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                  <div>
                    <h2>Dados do Anúncio</h2>
                    <p>Informações principais sobre o que você está anunciando</p>
                  </div>
                </div>
                
                <div className={styles.formGrid64}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Título do Anúncio <span style={{color: '#ef4444'}}>*</span></label>
                    <input type="text" className={styles.formInput} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Trator Massey Ferguson 2018" required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Categoria <span style={{color: '#ef4444'}}>*</span></label>
                    <select className={styles.formInput} value={categoria} onChange={e => setCategoria(e.target.value)} required>
                      <option value="">Selecione...</option>
                      {CATEGORIES.map(c => <option key={c.id} value={c.id.replace('cat-', '')}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  <div className={styles.colFull}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Descrição <span style={{color: '#ef4444'}}>*</span></label>
                    <RichTextEditor value={descricao} onChange={setDescricao} placeholder="Descreva detalhes importantes..." />
                  </div>
                  
                  <div className={styles.colFull} style={{ marginTop: '0.5rem', paddingTop: '2rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 1.2rem 0' }}>Valores e Condições</h3>
                    <div className={styles.formGrid4}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Moeda</label>
                        <select className={styles.formInput} value={moeda} onChange={e => setMoeda(e.target.value)}>
                          <option value="BRL">BRL — Real Brasileiro</option>
                          <option value="ARS">ARS — Peso Argentino</option>
                          <option value="UYU">UYU — Peso Uruguaio</option>
                          <option value="PYG">PYG — Guarani Paraguaio</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Preço</label>
                          <label className={styles.negotiateToggleInline}>
                            <span>A negociar</span>
                            <input type="checkbox" style={{ display: 'none' }} checked={aNegociar} onChange={e => setANegociar(e.target.checked)} />
                            <div className={styles.toggleSwitchSm}></div>
                          </label>
                        </div>
                        <input type="number" className={styles.formInput} value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" min="0" step="0.01" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Unidade (opc)</label>
                        <select className={styles.formInput} value={unidadePreco} onChange={e => setUnidadePreco(e.target.value)}>
                          <option value="">Nenhuma / Valor total</option>
                          <option value="por unidade">por unidade</option>
                          <option value="por kg">por kg</option>
                          <option value="por saca (60kg)">por saca (60kg)</option>
                          <option value="por arroba">por arroba</option>
                          <option value="por cabeça">por cabeça</option>
                          <option value="por hectare">por hectare</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Condição</label>
                        <select className={styles.formInput} value={condicao} onChange={e => setCondicao(e.target.value)}>
                          <option value="">Não aplicável</option>
                          <option value="novo">Novo</option>
                          <option value="usado">Usado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className={styles.wizardActions}>
                  <button type="button" className="btn btn--accent btn--lg" onClick={nextStep}>Próximo Passo</button>
                </div>
              </div>
            </div>

            {/* STEP 2: LOCAL */}
            <div className={`${styles.stepPane} ${currentStep === 2 ? styles.active : ''}`}>
              <div className={styles.formSection}>
                <div className={styles.formSectionHeader} style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className={styles.sectionIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div>
                      <h2>Localização</h2>
                      <p>Onde está o produto ou serviço anunciado?</p>
                    </div>
                  </div>
                  <button type="button" className={styles.btnOutline} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={fetchLocation}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Usar minha localização
                  </button>
                </div>
                
                <div className={styles.formGrid3}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>País <span style={{color: '#ef4444'}}>*</span></label>
                    <select className={styles.formInput} value={pais} onChange={e => setPais(e.target.value)}>
                      <option value="">Selecione...</option>
                      <option value="Brasil">Brasil</option>
                      <option value="Argentina">Argentina</option>
                      <option value="Uruguai">Uruguai</option>
                      <option value="Paraguai">Paraguai</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Estado <span style={{color: '#ef4444'}}>*</span></label>
                    <input type="text" className={styles.formInput} value={estado} onChange={e => setEstado(e.target.value)} placeholder="Ex: Mato Grosso do Sul" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>Cidade <span style={{color: '#ef4444'}}>*</span></label>
                    <input type="text" className={styles.formInput} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: Campo Grande" />
                  </div>
                </div>
                
                <div className={styles.wizardActions}>
                  <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={prevStep} style={{ padding: '0.8rem 2rem' }}>Voltar</button>
                  <button type="button" className="btn btn--accent btn--lg" onClick={nextStep}>Próximo Passo</button>
                </div>
              </div>
            </div>

            {/* STEP 3: FOTOS */}
            <div className={`${styles.stepPane} ${currentStep === 3 ? styles.active : ''}`}>
              <div className={styles.formSection}>
                <div className={styles.formSectionHeader}>
                  <div className={styles.sectionIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <div>
                    <h2>Fotos do Anúncio</h2>
                    <p>Adicione até 6 fotos. Anúncios com fotos recebem 5x mais contatos.</p>
                  </div>
                </div>
                
                <div className={styles.photoUploadZone} onClick={() => fileInputRef.current?.click()}>
                  <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
                  <div className={styles.uploadIcon}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--clr-primary)', fontSize: '1.1rem' }}>Clique para selecionar</strong> ou arraste fotos aqui
                    <p style={{ color: 'var(--clr-muted)', fontSize: '0.88rem', marginTop: '0.5rem' }}>JPEG, PNG, WebP — Máximo de 6 imagens, 10 MB cada</p>
                  </div>
                </div>
                
                {selectedFiles.length > 0 && (
                  <div className={styles.photoPreviews}>
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className={styles.photoThumb}>
                        <img src={URL.createObjectURL(file)} alt="Preview" />
                        <button type="button" className={styles.removeBtn} onClick={() => removeFile(idx)}>x</button>
                      </div>
                    ))}
                  </div>
                )}
                
                {uploadStatus && (
                  <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500 }}>
                      <span>{uploadStatus}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--clr-primary)', transition: 'width 0.3s' }}></div>
                    </div>
                  </div>
                )}
                
                {errorMsg && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '12px', fontWeight: 500 }}>
                    {errorMsg}
                  </div>
                )}

                <div className={styles.wizardActions}>
                  <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={prevStep} style={{ padding: '0.8rem 2rem' }}>Voltar</button>
                  <button type="submit" className="btn btn--accent btn--lg" disabled={isSubmitting}>
                    {isSubmitting ? 'Publicando...' : 'Publicar Anúncio'}
                  </button>
                </div>
                <p style={{ textAlign: 'right', fontSize: '.82rem', color: 'var(--clr-muted)', margin: 0, paddingTop: '1rem' }}>
                  Seu anúncio ficará disponível após revisão em até 24h.
                </p>
              </div>
            </div>
            
          </form>
        </div>
      </main>
    </>
  )
}

export default function AnunciarPage() {
  return (
    <Suspense fallback={<div style={{marginTop:'var(--header-h)', padding:'2rem', textAlign:'center'}}>Carregando...</div>}>
      <AnunciarContent />
    </Suspense>
  )
}

function AnunciarContent() {
  return (
    <React.Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Carregando...</div>}>
      <AnunciarForm />
    </React.Suspense>
  )
}
