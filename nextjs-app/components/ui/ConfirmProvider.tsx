'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { useLang } from '@/lib/lang-context'

type ConfirmContextType = {
  confirm: (message: string, title?: string) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

// BUG CORRIGIDO (auditoria de cobertura de i18n em todas as páginas de
// cliente, retomada da validação "sem exceção"): título/botões padrão
// hardcoded em português — o componente não tinha nenhuma noção de idioma,
// então qualquer chamador que não passasse um título traduzido (a maioria)
// mostrava "Confirmação" mesmo com tc_lang=es.
const DEFAULT_TITLE = { pt: 'Confirmação', es: 'Confirmación' } as const
const BUTTON_LABELS = { pt: { cancel: 'Cancelar', confirm: 'Confirmar' }, es: { cancel: 'Cancelar', confirm: 'Confirmar' } } as const

export const useConfirm = () => {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}

type PendingConfirm = { message: string; title: string; resolve: (value: boolean) => void }

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const { lang } = useLang()
  // BUG CORRIGIDO (varredura cruzada de cenários): um único slot de
  // `resolver` era sobrescrito por uma segunda chamada de confirm() antes da
  // primeira ser respondida — o `await confirm(...)` da PRIMEIRA chamada
  // ficava pendurado pra sempre (nunca resolve), já que seu resolver foi
  // perdido. Agora as chamadas entram numa fila e são exibidas uma de cada
  // vez, na ordem em que chegaram.
  const [queue, setQueue] = useState<PendingConfirm[]>([])
  const current = queue[0] ?? null

  const confirm = (msg: string, titleStr?: string) => {
    return new Promise<boolean>((resolve) => {
      setQueue(q => [...q, { message: msg, title: titleStr ?? DEFAULT_TITLE[lang], resolve }])
    })
  }

  const handleConfirm = () => {
    current?.resolve(true)
    setQueue(q => q.slice(1))
  }

  const handleCancel = () => {
    current?.resolve(false)
    setQueue(q => q.slice(1))
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {current && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px', padding: '24px',
            width: '90%', maxWidth: '400px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            transform: 'translateY(0)', transition: 'all 0.3s ease-out'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
              {current.title}
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: '#475569', lineHeight: 1.5 }}>
              {current.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={handleCancel}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0',
                  background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: '0.9rem',
                  cursor: 'pointer', outline: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#F1F5F9'}
                onMouseOut={(e) => e.currentTarget.style.background = '#F8FAFC'}
              >
                {BUTTON_LABELS[lang].cancel}
              </button>
              <button 
                onClick={handleConfirm}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: '#3B82F6', color: '#fff', fontWeight: 600, fontSize: '0.9rem',
                  cursor: 'pointer', outline: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                onMouseOut={(e) => e.currentTarget.style.filter = 'brightness(1)'}
              >
                {BUTTON_LABELS[lang].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
