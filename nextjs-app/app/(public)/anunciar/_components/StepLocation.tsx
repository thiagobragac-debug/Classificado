'use client'

import React, { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { MapPin, Target } from 'lucide-react'
import styles from '../page.module.css'
import { AnuncioFormValues } from './schema'
import { useLang } from '@/lib/lang-context'

// Strings exclusivas deste passo do wizard — padrão local de TRANSLATIONS,
// igual components/ads/AdsSidebar.tsx. Os `value` dos países permanecem em
// PT (canônicos no banco — ver normalizeCountry abaixo); só o texto exibido
// muda com o idioma, mesmo padrão já usado em components/home/MercosulSection.tsx.
const TRANSLATIONS = {
  pt: {
    header: 'Localização',
    headerDesc: 'Onde está o produto ou serviço anunciado?',
    locating: 'Buscando...',
    useLocation: 'Usar minha localização',
    countryLabel: 'País',
    selectPlaceholder: 'Selecione...',
    brasil: 'Brasil',
    argentina: 'Argentina',
    uruguai: 'Uruguai',
    paraguai: 'Paraguai',
    stateLabel: 'Estado',
    statePh: 'Ex: Mato Grosso do Sul',
    cityLabel: 'Cidade',
    cityPh: 'Ex: Campo Grande',
    back: 'Voltar',
    nextStep: 'Próximo Passo',
  },
  es: {
    header: 'Ubicación',
    headerDesc: '¿Dónde está el producto o servicio anunciado?',
    locating: 'Buscando...',
    useLocation: 'Usar mi ubicación',
    countryLabel: 'País',
    selectPlaceholder: 'Seleccionar...',
    brasil: 'Brasil',
    argentina: 'Argentina',
    uruguai: 'Uruguay',
    paraguai: 'Paraguay',
    stateLabel: 'Estado / Provincia',
    statePh: 'Ej: Mato Grosso do Sul',
    cityLabel: 'Ciudad',
    cityPh: 'Ej: Campo Grande',
    back: 'Volver',
    nextStep: 'Siguiente Paso',
  },
} as const

interface StepLocationProps {
  onNext: () => void;
  onPrev: () => void;
}

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
}

export function StepLocation({ onNext, onPrev }: StepLocationProps) {
  const { register, trigger, setValue, formState: { errors } } = useFormContext<AnuncioFormValues>()
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [isLocating, setIsLocating] = useState(false)

  const fetchLocation = async () => {
    setIsLocating(true)
    // BUG CORRIGIDO (varredura cruzada de cenários): os provedores de geo
    // (ipapi.co, Nominatim) retornam o nome do país em inglês/espanhol
    // ("Uruguay", "Paraguay"), não nas grafias em PT usadas como `value`
    // dos <option> ("Uruguai", "Paraguai"). Um país não reconhecido caía
    // no `return nc` e era gravado cru no formulário — o <select> ficava
    // preso em "Selecione..." (nenhum <option> bate com o valor) mas o
    // RHF já considerava o campo "preenchido", deixando passar validação
    // com um valor que não corresponde a nenhum país aceito.
    const normalizeCountry = (nc: string): string | null => {
      if (!nc) return null
      if (nc.includes('Brasil') || nc === 'Brazil' || nc === 'BR') return 'Brasil'
      if (nc.includes('Argentina')) return 'Argentina'
      if (nc.includes('Uruguai') || nc.includes('Uruguay')) return 'Uruguai'
      if (nc.includes('Paraguai') || nc.includes('Paraguay')) return 'Paraguai'
      return null
    }

    const setLocationData = (country: string, state: string, city: string) => {
      if (country) {
        const paisNormalizado = normalizeCountry(country)
        if (paisNormalizado) setValue('pais', paisNormalizado, { shouldValidate: true })
      }
      if (state) {
        const stateCode = BR_STATES[state] || state
        setValue('estado', stateCode.length === 2 ? stateCode : state, { shouldValidate: true })
      }
      if (city) setValue('cidade', city, { shouldValidate: true })
      setIsLocating(false)
    }

    const fetchViaIP = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        setLocationData(data.country_name, data.region, data.city)
      } catch(e) {
        console.warn("Could not fetch location via IP", e)
        setIsLocating(false)
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          setLocationData(data.address.country, data.address.state, data.address.city || data.address.town || data.address.village)
        } catch (e) {
          console.warn("Could not fetch location via OSM, falling back to IP", e)
          fetchViaIP()
        }
      }, () => {
        console.warn("Geolocation denied or failed, falling back to IP")
        fetchViaIP()
      })
    } else {
      fetchViaIP()
    }
  }

  const handleNext = async () => {
    const isStepValid = await trigger(['pais', 'estado', 'cidade'])
    if (isStepValid) {
      onNext()
    } else {
      document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className={styles.formSection}>
      <div className={styles.formSectionHeader} style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className={styles.sectionIcon}>
            <MapPin size={24} />
          </div>
          <div>
            <h2>{tr.header}</h2>
            <p>{tr.headerDesc}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.btnOutline}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          onClick={fetchLocation}
          disabled={isLocating}
        >
          <Target size={16} />
          {isLocating ? tr.locating : tr.useLocation}
        </button>
      </div>

      <div className={styles.formGrid3}>
        <div>
          <label htmlFor="step-pais" className={styles.inputLabel}>{tr.countryLabel} <span>*</span></label>
          <select id="step-pais" className={styles.formInput} {...register('pais')}>
            <option value="">{tr.selectPlaceholder}</option>
            <option value="Brasil">{tr.brasil}</option>
            <option value="Argentina">{tr.argentina}</option>
            <option value="Uruguai">{tr.uruguai}</option>
            <option value="Paraguai">{tr.paraguai}</option>
          </select>
          {errors.pais && <span className={styles.errorText}>{errors.pais.message}</span>}
        </div>
        <div>
          <label htmlFor="step-estado" className={styles.inputLabel}>{tr.stateLabel} <span>*</span></label>
          <input id="step-estado" type="text" className={styles.formInput} placeholder={tr.statePh} {...register('estado')} />
          {errors.estado && <span className={styles.errorText}>{errors.estado.message}</span>}
        </div>
        <div>
          <label htmlFor="step-cidade" className={styles.inputLabel}>{tr.cityLabel} <span>*</span></label>
          <input id="step-cidade" type="text" className={styles.formInput} placeholder={tr.cityPh} {...register('cidade')} />
          {errors.cidade && <span className={styles.errorText}>{errors.cidade.message}</span>}
        </div>
      </div>

      <div className={styles.wizardActions}>
        <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={onPrev} style={{ padding: '0.8rem 2rem' }}>{tr.back}</button>
        <button type="button" className="btn btn--accent btn--lg" onClick={handleNext}>{tr.nextStep}</button>
      </div>
    </div>
  )
}
