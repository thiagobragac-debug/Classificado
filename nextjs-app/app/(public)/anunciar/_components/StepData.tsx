'use client'

import React, { useEffect, useState } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import styles from '../page.module.css'
import RichTextEditor from '@/components/RichTextEditor'
import { AnuncioFormValues } from './schema'
import { CurrencyInput } from './CurrencyInput'
import { getSupabase } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'

interface StepDataProps {
  onNext: () => void;
}

// Strings exclusivas deste passo do wizard — padrão local de TRANSLATIONS,
// igual components/ads/AdsSidebar.tsx.
const TRANSLATIONS = {
  pt: {
    header: 'Dados do Anúncio',
    headerDesc: 'Informações principais sobre o que você está anunciando',
    titleLabel: 'Título do Anúncio',
    titlePh: 'Ex: Trator Massey Ferguson 2018',
    categoryLabel: 'Categoria',
    selectPlaceholder: 'Selecione...',
    descLabel: 'Descrição',
    descPh: 'Descreva detalhes importantes...',
    valuesHeader: 'Valores e Condições',
    currencyLabel: 'Moeda',
    currencyBRL: 'BRL — Real Brasileiro',
    currencyARS: 'ARS — Peso Argentino',
    currencyUYU: 'UYU — Peso Uruguaio',
    currencyPYG: 'PYG — Guarani Paraguaio',
    priceLabel: 'Preço',
    negotiate: 'A negociar',
    negotiateAria: 'Preço a negociar',
    unitLabel: 'Unidade (opc)',
    unitNone: 'Nenhuma / Valor total',
    unitPerUnit: 'por unidade',
    unitPerKg: 'por kg',
    unitPerSack: 'por saca (60kg)',
    unitPerArroba: 'por arroba',
    unitPerHead: 'por cabeça',
    unitPerHectare: 'por hectare',
    conditionLabel: 'Condição',
    conditionNA: 'Não aplicável',
    conditionNew: 'Novo',
    conditionUsed: 'Usado',
    nextStep: 'Próximo Passo',
  },
  es: {
    header: 'Datos del Anuncio',
    headerDesc: 'Información principal sobre lo que estás anunciando',
    titleLabel: 'Título del Anuncio',
    titlePh: 'Ej: Tractor Massey Ferguson 2018',
    categoryLabel: 'Categoría',
    selectPlaceholder: 'Seleccionar...',
    descLabel: 'Descripción',
    descPh: 'Describe detalles importantes...',
    valuesHeader: 'Valores y Condiciones',
    currencyLabel: 'Moneda',
    currencyBRL: 'BRL — Real Brasileño',
    currencyARS: 'ARS — Peso Argentino',
    currencyUYU: 'UYU — Peso Uruguayo',
    currencyPYG: 'PYG — Guaraní Paraguayo',
    priceLabel: 'Precio',
    negotiate: 'A negociar',
    negotiateAria: 'Precio a negociar',
    unitLabel: 'Unidad (opc)',
    unitNone: 'Ninguna / Valor total',
    unitPerUnit: 'por unidad',
    unitPerKg: 'por kg',
    unitPerSack: 'por saco (60kg)',
    unitPerArroba: 'por arroba',
    unitPerHead: 'por cabeza',
    unitPerHectare: 'por hectárea',
    conditionLabel: 'Condición',
    conditionNA: 'No aplicable',
    conditionNew: 'Nuevo',
    conditionUsed: 'Usado',
    nextStep: 'Siguiente Paso',
  },
} as const

export function StepData({ onNext }: StepDataProps) {
  const { register, control, trigger, watch, setValue, getValues, formState: { errors } } = useFormContext<AnuncioFormValues>()
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const moeda = watch('moeda') as string | undefined
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    async function loadCategories() {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })

      if (!error && data) {
        setCategories(data)
      }
    }
    loadCategories()
  }, [])

  // GAP CORRIGIDO (auditoria completa, 2026-08-25): o <select> de
  // categoria é não-controlado (register()) — seu valor inicial é
  // aplicado pela ref callback no MOUNT, quando só existe a option vazia
  // "Selecione...", já que a lista real de categorias chega depois, pelo
  // fetch assíncrono acima. Quando as options chegam, o <select> nunca é
  // ressincronizado com o valor do formulário (ex.: category_id de um
  // rascunho restaurado), e fica preso em "Selecione..." mesmo com o
  // valor certo no estado do formulário. Precisa ser um efeito separado,
  // disparado depois que `categories` já foi commitado no DOM (setValue
  // não seleciona um <option> que ainda não existe na árvore) — fazer
  // isso no mesmo efeito do fetch, logo após setCategories(), roda cedo
  // demais, antes do React re-renderizar com as novas options.
  useEffect(() => {
    if (categories.length > 0) {
      setValue('categoria', getValues('categoria'), { shouldDirty: false, shouldTouch: false })
    }
  }, [categories, setValue, getValues])

  const handleNext = async () => {
    // Validate only this step's fields
    const isStepValid = await trigger(['titulo', 'categoria', 'descricao', 'moeda', 'preco', 'aNegociar', 'unidadePreco', 'condicao'])
    if (isStepValid) {
      onNext()
    } else {
      document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className={styles.formSection}>
      <div className={styles.formSectionHeader}>
        <div className={styles.sectionIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <div>
          <h2>{tr.header}</h2>
          <p>{tr.headerDesc}</p>
        </div>
      </div>

      <div className={styles.formGrid64}>
        <div>
          <label htmlFor="step-titulo" className={styles.inputLabel}>{tr.titleLabel} <span>*</span></label>
          <input
            id="step-titulo"
            type="text"
            className={styles.formInput}
            placeholder={tr.titlePh}
            {...register('titulo')}
          />
          {errors.titulo && <span className={styles.errorText}>{errors.titulo.message}</span>}
        </div>
        <div>
          <label htmlFor="step-categoria" className={styles.inputLabel}>{tr.categoryLabel} <span>*</span></label>
          <select id="step-categoria" className={styles.formInput} {...register('categoria')}>
            <option value="">{tr.selectPlaceholder}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{lang === 'es' && c.name_es ? c.name_es : c.name_pt}</option>)}
          </select>
          {errors.categoria && <span className={styles.errorText}>{errors.categoria.message}</span>}
        </div>

        <div className={styles.colFull}>
          <label className={styles.inputLabel}>{tr.descLabel} <span>*</span></label>
          <Controller
            name="descricao"
            control={control}
            render={({ field }) => (
              <RichTextEditor value={field.value} onChange={field.onChange} placeholder={tr.descPh} />
            )}
          />
          {errors.descricao && <span className={styles.errorText}>{errors.descricao.message}</span>}
        </div>

        <div className={`${styles.colFull} ${styles.divider}`}>
          <h3 className={styles.sectionSubHeader}>{tr.valuesHeader}</h3>
          <div className={styles.formGrid4}>
            <div>
              <label htmlFor="step-moeda" className={styles.inputLabel}>{tr.currencyLabel}</label>
              <select id="step-moeda" className={styles.formInput} {...register('moeda')}>
                <option value="BRL">{tr.currencyBRL}</option>
                <option value="ARS">{tr.currencyARS}</option>
                <option value="UYU">{tr.currencyUYU}</option>
                <option value="PYG">{tr.currencyPYG}</option>
              </select>
            </div>
            <div>
              <div className={styles.switchContainer}>
                <label htmlFor="step-preco" className={styles.inputLabel}>{tr.priceLabel}</label>
                <label className={styles.negotiateToggleInline}>
                  <span>{tr.negotiate}</span>
                  <input id="step-a-negociar" type="checkbox" className={styles.toggleInput} {...register('aNegociar')} aria-label={tr.negotiateAria} />
                  <div className={styles.toggleSwitchSm} aria-hidden="true"></div>
                </label>
              </div>
              <CurrencyInput name="preco" currency={moeda || 'BRL'} />
              {errors.preco && <span className={styles.errorText}>{errors.preco.message}</span>}
            </div>
            <div>
              <label htmlFor="step-unidade" className={styles.inputLabel}>{tr.unitLabel}</label>
              <select id="step-unidade" className={styles.formInput} {...register('unidadePreco')}>
                <option value="">{tr.unitNone}</option>
                <option value="por unidade">{tr.unitPerUnit}</option>
                <option value="por kg">{tr.unitPerKg}</option>
                <option value="por saca (60kg)">{tr.unitPerSack}</option>
                <option value="por arroba">{tr.unitPerArroba}</option>
                <option value="por cabeça">{tr.unitPerHead}</option>
                <option value="por hectare">{tr.unitPerHectare}</option>
              </select>
            </div>
            <div>
              <label htmlFor="step-condicao" className={styles.inputLabel}>{tr.conditionLabel}</label>
              <select id="step-condicao" className={styles.formInput} {...register('condicao')}>
                <option value="">{tr.conditionNA}</option>
                <option value="novo">{tr.conditionNew}</option>
                <option value="usado">{tr.conditionUsed}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.wizardActions}>
        <button type="button" className="btn btn--accent btn--lg" onClick={handleNext}>{tr.nextStep}</button>
      </div>
    </div>
  )
}
