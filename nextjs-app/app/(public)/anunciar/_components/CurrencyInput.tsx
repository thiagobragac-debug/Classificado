'use client'

import React from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { NumericFormat } from 'react-number-format'
import { getCurrencySymbol } from '@/lib/currency'
import styles from '../page.module.css'

interface CurrencyInputProps {
  name: string
  currency?: string
  placeholder?: string
  className?: string
}

export function CurrencyInput({ name, currency = 'BRL', placeholder = '0,00', className }: CurrencyInputProps) {
  const { control } = useFormContext()
  // BUG CORRIGIDO (retomada da verificação independente, 2ª rodada de
  // revisão adversarial): este componente mantinha seu próprio mapa de
  // símbolos, divergente do canônico em lib/currency.ts pra UYU/PYG ('UY$ '/
  // 'Gs ' aqui vs. '$U'/'₲' em todo o resto do site) — um vendedor criando
  // um anúncio via em UYU/PYG um símbolo aqui e outro em qualquer outra tela
  // (listagem, detalhe, cards, favoritos) pro MESMO anúncio.
  const prefix = `${getCurrencySymbol(currency)} `

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <NumericFormat
          getInputRef={ref}
          value={value}
          onValueChange={(values) => {
            onChange(values.value) // stores the unformatted value
          }}
          thousandSeparator="."
          decimalSeparator=","
          prefix={prefix}
          decimalScale={2}
          fixedDecimalScale
          allowNegative={false}
          className={className || styles.formInput}
          placeholder={placeholder}
        />
      )}
    />
  )
}
