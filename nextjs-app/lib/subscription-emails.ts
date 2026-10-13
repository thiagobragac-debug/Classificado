import { sendEmail } from '@/lib/send-email'
import { formatPrice } from '@/lib/currency'
import { SITE_URL } from '@/lib/locale'

// E-mails transacionais do ciclo de assinatura -- F11 da auditoria de 12/out/2026.
// Não existia NENHUM: sem confirmação de compra e sem aviso antes da 1ª cobrança
// cheia (o fluxo clássico de chargeback/Procon: cliente paga R$39,50, esquece e é
// cobrado R$79,00 -- ou, no anual, R$379,20 e depois R$758,40 -- sem nenhum aviso do
// app). Texto simples, PT/ES, sem dependência de configuração de Dashboard do
// gateway (nenhum gateway garante aviso pré-renovação).

export type Idioma = 'pt' | 'es'

const PAISES_ES = new Set(['AR', 'UY', 'PY', 'CL', 'BO', 'PE', 'CO', 'EC', 'VE', 'MX', 'ES'])

/** Português por padrão (Brasil/desconhecido); espanhol para os países hispânicos atendidos. */
export function idiomaPorPais(country?: string | null): Idioma {
  return country && PAISES_ES.has(country.trim().toUpperCase()) ? 'es' : 'pt'
}

export type CicloCobranca = 'monthly' | 'annual'

function dataLocal(d: Date, idioma: Idioma): string {
  return d.toLocaleDateString(idioma === 'es' ? 'es-AR' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

const LINK_PAINEL = () => `${SITE_URL}/painel#billing`

export interface DadosConfirmacao {
  plano: string
  ciclo: CicloCobranca
  /** Valor efetivamente cobrado agora. */
  valorPago: number
  moeda: string
  /** Preço cheio a restaurar depois do 1º ciclo (só quando a promoção de 50% valeu). */
  precoCheio?: number | null
  /** Data da próxima cobrança (fim do período concedido). */
  proximaCobranca?: Date | null
  idioma: Idioma
}

export function montarEmailConfirmacao(d: DadosConfirmacao): { subject: string; text: string } {
  const pago = formatPrice(d.valorPago, d.moeda, d.idioma)
  const mensal = d.ciclo === 'monthly'
  const proxima = d.proximaCobranca ? dataLocal(d.proximaCobranca, d.idioma) : null
  const promo = d.precoCheio != null && d.precoCheio > d.valorPago

  if (d.idioma === 'es') {
    const ciclo = mensal ? 'mensual' : 'anual'
    const periodo = mensal ? 'mes' : 'año'
    const linhas = [
      'Hola,',
      '',
      `Recibimos el pago de tu suscripción al plan ${d.plano} (${ciclo}).`,
      '',
      `Valor cobrado ahora: ${pago}`,
    ]
    if (promo) {
      linhas.push(
        `Este valor tiene 50% de descuento y vale solo para el 1.er ${periodo}.${proxima ? ` A partir del ${proxima},` : ' En el próximo cobro,'} el cobro pasa a ser de ${formatPrice(d.precoCheio!, d.moeda, 'es')} /${periodo}, automáticamente en la misma tarjeta.`,
      )
    } else if (proxima) {
      linhas.push(`Próximo cobro: ${proxima}.`)
    }
    linhas.push('', `Puedes ver tu suscripción, cambiar de plan o cancelar cuando quieras en: ${LINK_PAINEL()}`, '', 'Tauze Class')
    return { subject: `Suscripción ${d.plano} confirmada — Tauze Class`, text: linhas.join('\n') }
  }

  const ciclo = mensal ? 'mensal' : 'anual'
  const periodo = mensal ? 'mês' : 'ano'
  const linhas = [
    'Olá,',
    '',
    `Recebemos o pagamento da sua assinatura do plano ${d.plano} (${ciclo}).`,
    '',
    `Valor cobrado agora: ${pago}`,
  ]
  if (promo) {
    linhas.push(
      `Este valor tem 50% de desconto e vale só para o 1º ${periodo}.${proxima ? ` A partir de ${proxima},` : ' Na próxima cobrança,'} a cobrança passa a ser de ${formatPrice(d.precoCheio!, d.moeda, 'pt')} /${periodo}, automaticamente no mesmo cartão.`,
    )
  } else if (proxima) {
    linhas.push(`Próxima cobrança: ${proxima}.`)
  }
  linhas.push('', `Você pode acompanhar sua assinatura, trocar de plano ou cancelar quando quiser em: ${LINK_PAINEL()}`, '', 'Tauze Class')
  return { subject: `Assinatura ${d.plano} confirmada — Tauze Class`, text: linhas.join('\n') }
}

export interface DadosAvisoRenovacao {
  plano: string
  ciclo: CicloCobranca
  valorCheio: number
  moeda: string
  dataCobranca: Date
  idioma: Idioma
}

export function montarEmailAvisoRenovacao(d: DadosAvisoRenovacao): { subject: string; text: string } {
  const cheio = formatPrice(d.valorCheio, d.moeda, d.idioma)
  const data = dataLocal(d.dataCobranca, d.idioma)
  const mensal = d.ciclo === 'monthly'

  if (d.idioma === 'es') {
    const periodo = mensal ? 'mes' : 'año'
    return {
      subject: `Tu suscripción ${d.plano} se renueva el ${data} por ${cheio}`,
      text: [
        'Hola,',
        '',
        `El descuento de 50% de tu suscripción al plan ${d.plano} fue solo para el 1.er ${periodo}.`,
        `El ${data} se cobrará ${cheio} /${periodo}, automáticamente en la misma tarjeta, y así en cada ${periodo} hasta que canceles.`,
        '',
        `Si no quieres continuar, cancela antes de esa fecha en: ${LINK_PAINEL()} (tu plan sigue activo hasta el final del período ya pagado).`,
        '',
        'Tauze Class',
      ].join('\n'),
    }
  }
  const periodo = mensal ? 'mês' : 'ano'
  return {
    subject: `Sua assinatura ${d.plano} renova em ${data} por ${cheio}`,
    text: [
      'Olá,',
      '',
      `O desconto de 50% da sua assinatura do plano ${d.plano} valeu só para o 1º ${periodo}.`,
      `Em ${data} será cobrado ${cheio} /${periodo}, automaticamente no mesmo cartão, e assim a cada ${periodo} até você cancelar.`,
      '',
      `Se não quiser continuar, cancele antes dessa data em: ${LINK_PAINEL()} (seu plano segue ativo até o fim do período já pago).`,
      '',
      'Tauze Class',
    ].join('\n'),
  }
}

// Nunca deixa um e-mail travar ou derrubar o fluxo que o chamou (webhook de
// pagamento / cron): timeout curto e qualquer erro vira só um log.
export async function enviarSemBloquear(to: string, mensagem: { subject: string; text: string }, contexto: string): Promise<boolean> {
  try {
    await Promise.race([
      sendEmail({ to, subject: mensagem.subject, text: mensagem.text }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout de 8s no envio do e-mail')), 8000)),
    ])
    return true
  } catch (err: any) {
    console.warn(`[subscription-emails] ${contexto}: e-mail NÃO enviado (${err?.message || err}) -- o fluxo de pagamento continua normalmente.`)
    return false
  }
}
