'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useLang } from '@/lib/lang-context'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

// Mensagem de ajuda quando o widget falha — achado ao vivo (2026-09-25):
// um usuário real (não bot) ficou preso em "Falha na verificação" por causa
// de uma extensão de bloqueio de anúncio/privacidade no navegador (bloqueia
// o domínio challenges.cloudflare.com). O próprio Turnstile já tenta de novo
// sozinho (retry automático a cada ~8s, comportamento padrão da lib), mas
// se a causa for um bloqueio persistente do navegador, ele nunca vai
// resolver sozinho — e a mensagem padrão do widget ("Falha na verificação /
// Solução de problemas", em inglês técnico nos docs da Cloudflare) não dá
// nenhum caminho prático pra um usuário leigo. Mostra orientação em
// português assim que o primeiro erro acontece, sem esconder o widget (ele
// continua tentando sozinho em paralelo e pode se recuperar).
const TRANSLATIONS = {
  pt: {
    message: 'A verificação de segurança não carregou. Isso costuma acontecer com bloqueadores de anúncio ou de privacidade ativos — tente desativá-los para este site, ou use outro navegador.',
    help: 'Continua sem funcionar?',
    helpLink: 'Fale com o suporte',
  },
  es: {
    message: 'La verificación de seguridad no cargó. Esto suele pasar con bloqueadores de anuncios o de privacidad activos — intenta desactivarlos para este sitio, o usa otro navegador.',
    help: '¿Sigue sin funcionar?',
    helpLink: 'Habla con soporte',
  },
} as const

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
  const { lang } = useLang()
  const tr = TRANSLATIONS[lang]
  const [hasError, setHasError] = useState(false)

  if (!TURNSTILE_SITE_KEY) return null

  return (
    <div style={{ margin: '0.5rem 0' }}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => { setHasError(false); onVerify(token) }}
        onExpire={() => onExpire?.()}
        onError={() => { setHasError(true); onExpire?.() }}
      />
      {hasError && (
        <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', marginTop: '0.5rem', lineHeight: 1.4 }}>
          {tr.message}{' '}
          {tr.help}{' '}
          <a href="/institucional?page=ajuda" style={{ color: 'var(--clr-accent)', fontWeight: 600 }}>{tr.helpLink}</a>
        </div>
      )}
    </div>
  )
}
