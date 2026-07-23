'use client'

import React, { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { MapPin, Target } from 'lucide-react'
import styles from '../page.module.css'
import { AnuncioFormValues } from './schema'

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
  const [isLocating, setIsLocating] = useState(false)

  const fetchLocation = async () => {
    setIsLocating(true)
    const normalizeCountry = (nc: string) => {
      if (!nc) return ''
      if (nc.includes('Brasil') || nc === 'Brazil' || nc === 'BR') return 'Brasil'
      if (nc.includes('Argentina')) return 'Argentina'
      if (nc.includes('Uruguai')) return 'Uruguai'
      if (nc.includes('Paraguai')) return 'Paraguai'
      return nc
    }

    const setLocationData = (country: string, state: string, city: string) => {
      if (country) setValue('pais', normalizeCountry(country), { shouldValidate: true })
      if (state) {
        const stateCode = BR_STATES[state] || state
        setValue('estado', stateCode.length === 2 ? stateCode : state, { shouldValidate: true })
      }
      if (city) setValue('cidade', city, { shouldValidate: true })
      setIsLocating(false)
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          const data = await res.json()
          setLocationData(data.address.country, data.address.state, data.address.city || data.address.town)
        } catch (e) {
          console.warn("Could not fetch location via OSM", e)
          setIsLocating(false)
        }
      }, () => {
        setIsLocating(false)
      })
    } else {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        setLocationData(data.country_name, data.region, data.city)
      } catch(e) {
        console.warn("Could not fetch location via IP", e)
        setIsLocating(false)
      }
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
            <h2>Localização</h2>
            <p>Onde está o produto ou serviço anunciado?</p>
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
          {isLocating ? 'Buscando...' : 'Usar minha localização'}
        </button>
      </div>
      
      <div className={styles.formGrid3}>
        <div>
          <label className={styles.inputLabel}>País <span>*</span></label>
          <select className={styles.formInput} {...register('pais')}>
            <option value="">Selecione...</option>
            <option value="Brasil">Brasil</option>
            <option value="Argentina">Argentina</option>
            <option value="Uruguai">Uruguai</option>
            <option value="Paraguai">Paraguai</option>
          </select>
          {errors.pais && <span className={styles.errorText}>{errors.pais.message}</span>}
        </div>
        <div>
          <label className={styles.inputLabel}>Estado <span>*</span></label>
          <input type="text" className={styles.formInput} placeholder="Ex: Mato Grosso do Sul" {...register('estado')} />
          {errors.estado && <span className={styles.errorText}>{errors.estado.message}</span>}
        </div>
        <div>
          <label className={styles.inputLabel}>Cidade <span>*</span></label>
          <input type="text" className={styles.formInput} placeholder="Ex: Campo Grande" {...register('cidade')} />
          {errors.cidade && <span className={styles.errorText}>{errors.cidade.message}</span>}
        </div>
      </div>
      
      <div className={styles.wizardActions}>
        <button type="button" className={`${styles.btnOutline} btn--lg`} onClick={onPrev} style={{ padding: '0.8rem 2rem' }}>Voltar</button>
        <button type="button" className="btn btn--accent btn--lg" onClick={handleNext}>Próximo Passo</button>
      </div>
    </div>
  )
}
