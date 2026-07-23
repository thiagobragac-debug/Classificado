'use client'

import React from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { NumericFormat } from 'react-number-format'
import styles from '../page.module.css'

interface CurrencyInputProps {
  name: string
  placeholder?: string
  className?: string
}

export function CurrencyInput({ name, placeholder = '0,00', className }: CurrencyInputProps) {
  const { control } = useFormContext()

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
          prefix="R$ "
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
