'use client'

import React from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import styles from '../page.module.css'
import RichTextEditor from '@/components/RichTextEditor'
import { AnuncioFormValues } from './schema'
import { CurrencyInput } from './CurrencyInput'

// Fake categories for now, same as original data.js
const CATEGORIES = [
  { id: 'cat-bovinos', name: 'Bovinos' },
  { id: 'cat-equinos', name: 'Equinos' },
  { id: 'cat-suinos', name: 'Suínos' },
  { id: 'cat-maquinas', name: 'Máquinas Agrícolas' }
]

interface StepDataProps {
  onNext: () => void;
}

export function StepData({ onNext }: StepDataProps) {
  const { register, control, trigger, formState: { errors } } = useFormContext<AnuncioFormValues>()

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
          <label className={styles.inputLabel}>Título do Anúncio <span>*</span></label>
          <input 
            type="text" 
            className={styles.formInput} 
            placeholder="Ex: Trator Massey Ferguson 2018" 
            {...register('titulo')}
          />
          {errors.titulo && <span className={styles.errorText}>{errors.titulo.message}</span>}
        </div>
        <div>
          <label className={styles.inputLabel}>Categoria <span>*</span></label>
          <select className={styles.formInput} {...register('categoria')}>
            <option value="">Selecione...</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id.replace('cat-', '')}>{c.name}</option>)}
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
              <label className={styles.inputLabel}>Moeda</label>
              <select className={styles.formInput} {...register('moeda')}>
                <option value="BRL">BRL — Real Brasileiro</option>
                <option value="ARS">ARS — Peso Argentino</option>
                <option value="UYU">UYU — Peso Uruguaio</option>
                <option value="PYG">PYG — Guarani Paraguaio</option>
              </select>
            </div>
            <div>
              <div className={styles.switchContainer}>
                <label className={styles.inputLabel}>Preço</label>
                <label className={styles.negotiateToggleInline}>
                  <span>A negociar</span>
                  <input type="checkbox" className={styles.toggleInput} {...register('aNegociar')} aria-label="Preço a negociar" />
                  <div className={styles.toggleSwitchSm} aria-hidden="true"></div>
                </label>
              </div>
              <CurrencyInput name="preco" />
              {errors.preco && <span className={styles.errorText}>{errors.preco.message}</span>}
            </div>
            <div>
              <label className={styles.inputLabel}>Unidade (opc)</label>
              <select className={styles.formInput} {...register('unidadePreco')}>
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
              <label className={styles.inputLabel}>Condição</label>
              <select className={styles.formInput} {...register('condicao')}>
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
