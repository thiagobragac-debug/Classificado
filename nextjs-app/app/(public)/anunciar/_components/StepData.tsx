'use client'

import React, { useEffect, useState } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import styles from '../page.module.css'
import RichTextEditor from '@/components/RichTextEditor'
import { AnuncioFormValues } from './schema'
import { CurrencyInput } from './CurrencyInput'
import { getSupabase } from '@/lib/supabase'

interface StepDataProps {
  onNext: () => void;
}

export function StepData({ onNext }: StepDataProps) {
  const { register, control, trigger, watch, setValue, getValues, formState: { errors } } = useFormContext<AnuncioFormValues>()
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
          <h2>Dados do Anúncio</h2>
          <p>Informações principais sobre o que você está anunciando</p>
        </div>
      </div>

      <div className={styles.formGrid64}>
        <div>
          <label htmlFor="step-titulo" className={styles.inputLabel}>Título do Anúncio <span>*</span></label>
          <input
            id="step-titulo"
            type="text"
            className={styles.formInput}
            placeholder="Ex: Trator Massey Ferguson 2018"
            {...register('titulo')}
          />
          {errors.titulo && <span className={styles.errorText}>{errors.titulo.message}</span>}
        </div>
        <div>
          <label htmlFor="step-categoria" className={styles.inputLabel}>Categoria <span>*</span></label>
          <select id="step-categoria" className={styles.formInput} {...register('categoria')}>
            <option value="">Selecione...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
          </select>
          {errors.categoria && <span className={styles.errorText}>{errors.categoria.message}</span>}
        </div>

        <div className={styles.colFull}>
          <label className={styles.inputLabel}>Descrição <span>*</span></label>
          <Controller
            name="descricao"
            control={control}
            render={({ field }) => (
              <RichTextEditor value={field.value} onChange={field.onChange} placeholder="Descreva detalhes importantes..." />
            )}
          />
          {errors.descricao && <span className={styles.errorText}>{errors.descricao.message}</span>}
        </div>

        <div className={`${styles.colFull} ${styles.divider}`}>
          <h3 className={styles.sectionSubHeader}>Valores e Condições</h3>
          <div className={styles.formGrid4}>
            <div>
              <label htmlFor="step-moeda" className={styles.inputLabel}>Moeda</label>
              <select id="step-moeda" className={styles.formInput} {...register('moeda')}>
                <option value="BRL">BRL — Real Brasileiro</option>
                <option value="ARS">ARS — Peso Argentino</option>
                <option value="UYU">UYU — Peso Uruguaio</option>
                <option value="PYG">PYG — Guarani Paraguaio</option>
              </select>
            </div>
            <div>
              <div className={styles.switchContainer}>
                <label htmlFor="step-preco" className={styles.inputLabel}>Preço</label>
                <label className={styles.negotiateToggleInline}>
                  <span>A negociar</span>
                  <input id="step-a-negociar" type="checkbox" className={styles.toggleInput} {...register('aNegociar')} aria-label="Preço a negociar" />
                  <div className={styles.toggleSwitchSm} aria-hidden="true"></div>
                </label>
              </div>
              <CurrencyInput name="preco" currency={moeda || 'BRL'} />
              {errors.preco && <span className={styles.errorText}>{errors.preco.message}</span>}
            </div>
            <div>
              <label htmlFor="step-unidade" className={styles.inputLabel}>Unidade (opc)</label>
              <select id="step-unidade" className={styles.formInput} {...register('unidadePreco')}>
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
              <label htmlFor="step-condicao" className={styles.inputLabel}>Condição</label>
              <select id="step-condicao" className={styles.formInput} {...register('condicao')}>
                <option value="">Não aplicável</option>
                <option value="novo">Novo</option>
                <option value="usado">Usado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.wizardActions}>
        <button type="button" className="btn btn--accent btn--lg" onClick={handleNext}>Próximo Passo</button>
      </div>
    </div>
  )
}
