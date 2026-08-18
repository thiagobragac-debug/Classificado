'use client'

import React from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { NumericFormat } from 'react-number-format'
import styles from '../page.module.css'

const CURRENCY_PREFIXES: Record<string, string> = {
  BRL: 'R$ ',
  USD: 'US$ ',
  ARS: 'AR$ ',
  UYU: 'UY$ ',
  PYG: 'Gs ',
}

interface CurrencyInputProps {
  name: string
  currency?: string
  placeholder?: string
  className?: string
}

export function CurrencyInput({ name, currency = 'BRL', placeholder = '0,00', className }: CurrencyInputProps) {
  const { control } = useFormContext()
  const prefix = CURRENCY_PREFIXES[currency] ?? 'R$ '

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
