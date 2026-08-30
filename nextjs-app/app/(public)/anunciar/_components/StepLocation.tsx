'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { MapPin, Target } from 'lucide-react'
import styles from '../page.module.css'
import { AnuncioFormValues } from './schema'
import { useLang } from '@/lib/lang-context'
import { showToast } from '@/lib/toast'

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
    selectCountryFirst: 'Selecione o país primeiro',
    cityLabel: 'Cidade',
    cityPh: 'Ex: Campo Grande',
    back: 'Voltar',
    nextStep: 'Próximo Passo',
    locationError: 'Não foi possível detectar sua localização automaticamente. Preencha os campos manualmente.',
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
    selectCountryFirst: 'Selecciona el país primero',
    cityLabel: 'Ciudad',
    cityPh: 'Ej: Campo Grande',
    back: 'Volver',
    nextStep: 'Siguiente Paso',
    locationError: 'No se pudo detectar tu ubicación automáticamente. Completa los campos manualmente.',
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

// Nomes completos dos estados brasileiros, extraídos do mapa bidirecional
// acima (as chaves cujo valor tem 2 caracteres são sempre os nomes
// completos — o valor é a sigla correspondente).
const BR_STATE_NAMES = Object.keys(BR_STATES).filter((k) => BR_STATES[k].length === 2)

// GAP CORRIGIDO (achado de usabilidade #1): "Estado" era texto livre no
// wizard, mas o filtro público (AdsSidebar.tsx) é um <select> alimentado
// pelos valores já gravados no banco — grafias que não batessem
// exatamente (acentuação, abreviação, digitação livre) deixavam o
// anúncio invisível pra quem filtra por estado. Listas fixas por país
// garantem que todo anúncio novo grava um valor normalizado e consistente.
const AR_PROVINCES = [
  'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
  'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
  'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

const UY_DEPARTMENTS = [
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores',
  'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú',
  'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano',
  'Tacuarembó', 'Treinta y Tres',
]

const PY_DEPARTMENTS = [
  'Concepción', 'San Pedro', 'Cordillera', 'Guairá', 'Caaguazú', 'Caazapá',
  'Itapúa', 'Misiones', 'Paraguarí', 'Alto Paraná', 'Central', 'Ñeembucú',
  'Amambay', 'Canindeyú', 'Presidente Hayes', 'Boquerón', 'Alto Paraguay',
  'Asunción',
]

// Mapeia o `value` do <select> de país (ver JSX abaixo — mantido em PT,
// canônico no banco) para a lista de estados/províncias correspondente.
const STATE_OPTIONS: Record<string, string[]> = {
  'Brasil': BR_STATE_NAMES,
  'Argentina': AR_PROVINCES,
  'Uruguai': UY_DEPARTMENTS,
  'Paraguai': PY_DEPARTMENTS,
}

export function StepLocation({ onNext, onPrev }: StepLocationProps) {
  const methods = useFormContext<AnuncioFormValues>()
  const { register, trigger, setValue, setFocus, watch, formState: { errors } } = methods
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [isLocating, setIsLocating] = useState(false)

  const pais = watch('pais') as string | undefined
  const stateOptions = (pais && STATE_OPTIONS[pais]) || []

  // Zera o estado (e a cidade, que depende dele) quando o país muda DEPOIS
  // do mount — mesmo padrão do efeito de categoria em StepData.tsx. No
  // mount, `pais` pode já vir de um rascunho/anúncio existente (com estado
  // correspondente), que não pode ser apagado.
  const prevPaisRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevPaisRef.current !== undefined && prevPaisRef.current !== pais) {
      setValue('estado', '', { shouldValidate: false })
      setValue('cidade', '', { shouldValidate: false })
    }
    prevPaisRef.current = pais
  }, [pais, setValue])

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
        // GAP CORRIGIDO (achado de usabilidade #1): "estado" agora é um
        // <select> com nomes completos fixos (ver STATE_OPTIONS acima) — se
        // o provedor de geo devolver a sigla de 2 letras (caso do Brasil),
        // normalizamos pro nome completo, senão o valor não bate com
        // nenhuma <option> e o select fica preso em "Selecione...".
        const trimmed = state.trim()
        const stateFull = trimmed.length === 2 ? (BR_STATES[trimmed.toUpperCase()] || trimmed) : trimmed
        setValue('estado', stateFull, { shouldValidate: true })
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
        // GAP CORRIGIDO (achado de usabilidade #4): esta é a última tentativa
        // da cascata (GPS -> OSM -> IP) — se ela falhar, nenhuma localização
        // foi preenchida e o usuário não tinha nenhum feedback, além do
        // console.warn invisível pra ele.
        showToast(tr.locationError, 'error')
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
    const fields = ['pais', 'estado', 'cidade'] as const
    const isStepValid = await trigger(fields)
    if (isStepValid) {
      onNext()
    } else {
      // GAP CORRIGIDO (achado de usabilidade #2): rolar só até o topo do
      // form não ajuda quando o campo inválido já está visível mas sem
      // foco (ou quando o form é mais alto que a viewport) — o usuário
      // não sabia qual campo corrigir. Foca o primeiro campo com erro.
      const firstInvalid = fields.find((f) => methods.getFieldState(f).invalid)
      if (firstInvalid) {
        setFocus(firstInvalid)
      } else {
        document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
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
          <select id="step-estado" className={styles.formInput} disabled={!pais} {...register('estado')}>
            <option value="">{pais ? tr.selectPlaceholder : tr.selectCountryFirst}</option>
            {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
