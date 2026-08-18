'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

type ConfirmContextType = {
  confirm: (message: string, title?: string) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export const useConfirm = () => {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('Confirmação')
  const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null)

  const confirm = (msg: string, titleStr: string = 'Confirmação') => {
    setMessage(msg)
    setTitle(titleStr)
    setIsOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolver({ resolve })
    })
  }

  const handleConfirm = () => {
    if (resolver) resolver.resolve(true)
    setIsOpen(false)
  }

  const handleCancel = () => {
    if (resolver) resolver.resolve(false)
    setIsOpen(false)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
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
              {title}
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: '#475569', lineHeight: 1.5 }}>
              {message}
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
                Cancelar
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
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
