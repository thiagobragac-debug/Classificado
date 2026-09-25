'use client'

import { useEffect, useId, useRef } from 'react'
import Script from 'next/script'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

// CAPTCHA (Cloudflare Turnstile) em login/cadastro/reset de senha —
// habilitado no Supabase Auth (Attack Protection) em 2026-09-25, contra
// bots/abuso automatizado nesses endpoints. CSP liberado em proxy.ts
// (TURNSTILE: script-src/frame-src/connect-src).
//
// Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY (ex.: ambiente local sem a env var
// configurada), o componente não renderiza nada — os formulários chamam
// login/cadastro/reset sem captchaToken, e o Supabase só rejeita se a
// proteção estiver habilitada no projeto (hoje só produção tem a chave).
//
// Token do Turnstile é single-use: o pai precisa remontar este componente
// (via prop `key`) depois de CADA tentativa de submit, sucesso ou erro —
// senão a 2ª tentativa reenvia um token já consumido e o Supabase rejeita
// mesmo com credenciais corretas.
export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false

    function render() {
      if (cancelled || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: onVerify,
        'expired-callback': () => onExpire?.(),
        'error-callback': () => onExpire?.(),
      })
    }

    if (window.turnstile) {
      render()
      return
    }

    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval)
        render()
      }
    }, 100)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId])

  if (!TURNSTILE_SITE_KEY) return null

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      <div id={containerId} style={{ margin: '0.5rem 0' }} />
    </>
  )
}
