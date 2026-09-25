'use client'

import { useRef, useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useLang } from '@/lib/lang-context'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

// Mensagem de ajuda quando o widget falha — achado ao vivo (2026-09-25): um
// usuário real (não bot) ficou preso em "Falha na verificação" por causa de
// uma extensão de bloqueio de anúncio/privacidade no navegador (bloqueia o
// domínio challenges.cloudflare.com). A mensagem padrão do widget ("Falha
// na verificação / Solução de problemas", em inglês técnico nos docs da
// Cloudflare) não dá nenhum caminho prático pra um usuário leigo.
//
// Self-service primeiro, suporte por último (achado do próprio usuário: um
// link de suporte como PRIMEIRA sugestão vira volume alto de chamado pra
// algo que na maioria das vezes um reload resolve sozinho) — ordem
// deliberada: 1) recarregar (resolve a maioria dos casos transitórios de
// rede/cache), 2) aba anônima/desativar bloqueador (resolve o caso real
// encontrado), 3) suporte só como último recurso, texto pequeno.
//
// Só mostra depois da 2ª falha consecutiva (errorCountRef), não da 1ª — o
// próprio Turnstile já tenta de novo sozinho (retry automático a cada ~8s,
// comportamento padrão da lib); alarmar no primeiro soluço de rede
// assustaria usuário à toa numa falha que se resolveria sozinha no retry.
const TRANSLATIONS = {
  pt: {
    message: 'A verificação de segurança não carregou.',
    reload: 'Recarregar página',
    tip: 'Se persistir, tente uma aba anônima ou desative bloqueadores de anúncio/privacidade para este site.',
    help: 'Nada disso resolveu?',
    helpLink: 'Fale com o suporte',
  },
  es: {
    message: 'La verificación de seguridad no cargó.',
    reload: 'Recargar página',
    tip: 'Si persiste, prueba una pestaña anónima o desactiva bloqueadores de anuncios/privacidad para este sitio.',
    help: '¿Nada de esto funcionó?',
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
  const [showHelp, setShowHelp] = useState(false)
  const errorCountRef = useRef(0)

  if (!TURNSTILE_SITE_KEY) return null

  const handleError = () => {
    errorCountRef.current += 1
    if (errorCountRef.current >= 2) setShowHelp(true)
    onExpire?.()
  }

  return (
    <div style={{ margin: '0.5rem 0' }}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => { errorCountRef.current = 0; setShowHelp(false); onVerify(token) }}
        onExpire={() => onExpire?.()}
        onError={handleError}
      />
      {showHelp && (
        <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', marginTop: '0.5rem', lineHeight: 1.4 }}>
          <div style={{ marginBottom: '0.4rem' }}>
            {tr.message}{' '}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ color: 'var(--clr-accent)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
            >
              {tr.reload}
            </button>
          </div>
          <div>{tr.tip}</div>
          <div>
            {tr.help}{' '}
            <a href="/institucional?page=ajuda" style={{ color: 'var(--clr-accent)', fontWeight: 600 }}>{tr.helpLink}</a>
          </div>
        </div>
      )}
    </div>
  )
}
