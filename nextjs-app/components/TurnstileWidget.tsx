'use client'

import { Turnstile } from '@marsidev/react-turnstile'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

// CAPTCHA (Cloudflare Turnstile) em login/cadastro/reset de senha —
// habilitado no Supabase Auth (Attack Protection) em 2026-09-25, contra
// bots/abuso automatizado nesses endpoints. CSP liberado em proxy.ts
// (TURNSTILE: script-src/frame-src/connect-src).
//
// BUG CORRIGIDO (achado ao vivo em produção, 2026-09-25): uma implementação
// própria (render/remove manual via window.turnstile, useId + useRef) tinha
// uma race condition real ao trocar de aba Entrar/Criar Conta sem reload de
// página (AnimatePresence do AuthContainer) — o widget "renderizava"
// estruturalmente (container com altura correta, id de widget válido
// devolvido) mas o iframe de verificação em si nunca era injetado, deixando
// o CAPTCHA em branco pro usuário na 2ª navegação em diante. Trocado pela
// lib mantida @marsidev/react-turnstile, que já resolve especificamente
// esses casos de remount/cleanup do React — mesmo padrão já usado no resto
// do projeto (preferir lib madura a reimplementar o ciclo de vida na mão).
//
// Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY (ex.: ambiente local sem a env var
// configurada), o componente não renderiza nada — os formulários chamam
// login/cadastro/reset sem captchaToken, e o Supabase só rejeita se a
// proteção estiver habilitada no projeto (hoje só produção tem a chave).
export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  if (!TURNSTILE_SITE_KEY) return null

  return (
    <div style={{ margin: '0.5rem 0' }}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={onVerify}
        onExpire={() => onExpire?.()}
        onError={() => onExpire?.()}
      />
    </div>
  )
}
