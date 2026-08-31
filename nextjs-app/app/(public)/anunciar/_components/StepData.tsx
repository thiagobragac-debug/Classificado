'use client'

import React, { useEffect, useState } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import styles from '../page.module.css'
import RichTextEditor from '@/components/RichTextEditor'
import { AnuncioFormValues } from './schema'
import { CurrencyInput } from './CurrencyInput'
import { getSupabase } from '@/lib/supabase'
import { useLang } from '@/lib/lang-context'
import { getPurposeOptions, getSubcategoryLabels } from '@/lib/purposeOptions'

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
    purposeLabel: 'Finalidade',
    purposeNone: 'Não informar',
    selectPlaceholder: 'Selecione...',
    selectCategoryFirst: 'Selecione a categoria primeiro',
    categoriesError: 'Não foi possível carregar as categorias.',
    categoriesRetry: 'Tentar novamente',
    subcategoriesError: 'Não foi possível carregar as subcategorias.',
    subcategoriesRetry: 'Tentar novamente',
    subcategoriesEmpty: 'Esta categoria ainda não tem subcategorias cadastradas.',
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
    purposeLabel: 'Finalidad',
    purposeNone: 'No informar',
    selectPlaceholder: 'Seleccionar...',
    selectCategoryFirst: 'Selecciona la categoría primero',
    categoriesError: 'No se pudieron cargar las categorías.',
    categoriesRetry: 'Intentar de nuevo',
    subcategoriesError: 'No se pudieron cargar las subcategorías.',
    subcategoriesRetry: 'Intentar de nuevo',
    subcategoriesEmpty: 'Esta categoría todavía no tiene subcategorías registradas.',
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
  const methods = useFormContext<AnuncioFormValues>()
  const { register, control, trigger, watch, setValue, setFocus, getValues, formState: { errors } } = methods
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const moeda = watch('moeda') as string | undefined
  const categoria = watch('categoria') as string | undefined
  const titulo = watch('titulo') as string | undefined
  const descricao = watch('descricao') as string | undefined
  const tituloLen = titulo?.length || 0
  const descricaoLen = descricao?.length || 0
  const [categories, setCategories] = useState<any[]>([])
  // BUG CORRIGIDO (varredura cruzada de cenários): sem estado de erro, uma
  // falha real do fetch (rede, RLS) deixava `categories` vazio pra sempre,
  // sem nenhum feedback — o <select> (campo obrigatório) ficava travado em
  // "Selecione..." indistinguível de "ainda carregando", bloqueando o
  // wizard inteiro sem explicação.
  const [categoriesError, setCategoriesError] = useState(false)

  // BUG CORRIGIDO (validação adversarial final): a mensagem de erro dizia
  // "tente novamente" sem nenhum jeito real de tentar de novo — só recarregar
  // a página inteira (perdendo o resto do formulário já preenchido).
  // Extraída do efeito pra poder ser chamada de novo pelo botão de retry.
  async function loadCategories() {
    setCategoriesError(false)
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (!error && data) {
      setCategories(data)
    } else if (error) {
      console.error('Erro ao carregar categorias:', error.message)
      setCategoriesError(true)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  // Subcategoria depende da categoria escolhida — mesmo padrão de
  // fetch+erro+retry usado acima para `categories`.
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [subcategoriesError, setSubcategoriesError] = useState(false)
  const prevCategoriaRef = React.useRef<string | undefined>(undefined)

  async function loadSubcategories(categoryId?: string) {
    setSubcategoriesError(false)
    if (!categoryId) {
      setSubcategories([])
      return
    }
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('subcategories')
      .select('*')
      .eq('category_id', categoryId)
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (!error && data) {
      setSubcategories(data)
    } else if (error) {
      console.error('Erro ao carregar subcategorias:', error.message)
      setSubcategoriesError(true)
    }
  }

  useEffect(() => {
    // Só zera a subcategoria quando a categoria REALMENTE muda depois do
    // mount — no mount, `categoria` pode já vir de um rascunho restaurado
    // (junto com a subcategoria correspondente), que não pode ser apagada.
    if (prevCategoriaRef.current !== undefined && prevCategoriaRef.current !== categoria) {
      setValue('subcategoria', '', { shouldValidate: false })
      setValue('finalidade', '', { shouldValidate: false })
    }
    prevCategoriaRef.current = categoria
    loadSubcategories(categoria)
  }, [categoria])

  // Finalidade é um conjunto fixo por categoria (sem fetch — ver
  // lib/purposeOptions.ts), diferente de `subcategories` (que vem do banco).
  const purposeOptions = getPurposeOptions(categoria)
  const subcategoryLabels = getSubcategoryLabels(categoria)

  // Mesmo GAP CORRIGIDO do efeito de `categoria` logo abaixo, aplicado à
  // subcategoria: ressincroniza o <select> depois que as options chegam.
  useEffect(() => {
    if (subcategories.length > 0) {
      setValue('subcategoria', getValues('subcategoria'), { shouldDirty: false, shouldTouch: false })
    }
  }, [subcategories, setValue, getValues])

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
    const fields = ['titulo', 'categoria', 'subcategoria', 'descricao', 'moeda', 'preco', 'aNegociar', 'unidadePreco', 'condicao'] as const
    const isStepValid = await trigger(fields)

    // GAP CORRIGIDO (teste de estresse full-system, 2026-08-31): subcategoria
    // é obrigatória incondicionalmente no schema — uma categoria (futura) sem
    // NENHUMA subcategoria cadastrada deixaria o <select> sempre vazio e o
    // formulário nunca validaria, tornando impossível publicar nela. Quando a
    // lista carregada é genuinamente vazia (não erro de rede) e subcategoria
    // é o ÚNICO campo inválido (checado via getFieldState, não `errors` —
    // que fica com o snapshot de ANTES deste trigger()), trata como não
    // aplicável a esta categoria.
    const semSubcategoriaDisponivel = !!categoria && !subcategoriesError && subcategories.length === 0
    const bloqueiaSoPorSubcategoria = !isStepValid && semSubcategoriaDisponivel &&
      fields.filter((f) => methods.getFieldState(f).invalid).every((f) => f === 'subcategoria')

    if (isStepValid || bloqueiaSoPorSubcategoria) {
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
          <div className={styles.labelRow}>
            <label htmlFor="step-titulo" className={styles.inputLabel}>{tr.titleLabel} <span>*</span></label>
            <span className={styles.charCounter} style={tituloLen > 100 ? { color: '#ef4444' } : undefined}>{tituloLen}/100</span>
          </div>
          <input
            id="step-titulo"
            type="text"
            className={styles.formInput}
            placeholder={tr.titlePh}
            maxLength={100}
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
          {categoriesError && (
            <span className={styles.errorText}>
              {tr.categoriesError}{' '}
              <button
                type="button"
                onClick={() => loadCategories()}
                style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
              >
                {tr.categoriesRetry}
              </button>
            </span>
          )}
        </div>
        <div>
          <label htmlFor="step-subcategoria" className={styles.inputLabel}>{lang === 'es' ? subcategoryLabels.label_es : subcategoryLabels.label_pt} <span>*</span></label>
          <select id="step-subcategoria" className={styles.formInput} disabled={!categoria} {...register('subcategoria')}>
            <option value="">{categoria ? tr.selectPlaceholder : tr.selectCategoryFirst}</option>
            {subcategories.map(s => <option key={s.id} value={s.id}>{lang === 'es' && s.name_es ? s.name_es : s.name_pt}</option>)}
          </select>
          {errors.subcategoria && <span className={styles.errorText}>{errors.subcategoria.message}</span>}
          {subcategoriesError && (
            <span className={styles.errorText}>
              {tr.subcategoriesError}{' '}
              <button
                type="button"
                onClick={() => loadSubcategories(categoria)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
              >
                {tr.subcategoriesRetry}
              </button>
            </span>
          )}
          {!subcategoriesError && categoria && subcategories.length === 0 && (
            <span className={styles.errorText}>{tr.subcategoriesEmpty}</span>
          )}
        </div>
        {purposeOptions.length > 0 && (
          <div>
            <label htmlFor="step-finalidade" className={styles.inputLabel}>{tr.purposeLabel}</label>
            <select id="step-finalidade" className={styles.formInput} {...register('finalidade')}>
              <option value="">{tr.purposeNone}</option>
              {purposeOptions.map(p => <option key={p.value} value={p.value}>{lang === 'es' ? p.label_es : p.label_pt}</option>)}
            </select>
          </div>
        )}

        <div className={styles.colFull}>
          <div className={styles.labelRow}>
            <label className={styles.inputLabel}>{tr.descLabel} <span>*</span></label>
            <span className={styles.charCounter} style={descricaoLen > 5000 ? { color: '#ef4444' } : undefined}>{descricaoLen}/5000</span>
          </div>
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
