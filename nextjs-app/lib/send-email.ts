import nodemailer from 'nodemailer'
import { createAdminClient, getSettings } from '@/lib/supabase-admin'
import { logError } from '@/lib/monitoring'

// Camada única de envio de e-mail, usada tanto pelo teste de configuração
// (app/api/admin/settings/test-email/route.ts) quanto pela resposta a
// mensagens de contato (app/api/admin/contact-messages/reply/route.ts).
// Suporta dois provedores, configuráveis em /admin/configuracoes (aba
// E-mail), lidos de platform_settings (mesmo padrão dos gateways de
// pagamento — resend_api_key/smtp_password protegidos por RLS, ver
// lib/secret-settings.ts):
//   - 'resend': API REST do Resend (sem SDK — só fetch, mesmo estilo do
//     resto do projeto, que não usa SDK pros gateways de pagamento).
//   - 'smtp': qualquer conta de e-mail via SMTP genérico (nodemailer) —
//     cobre Outlook/Office365, Gmail, ou qualquer outro provedor que
//     exponha host/porta/usuário/senha, exatamente como configurar uma
//     conta num cliente de e-mail de mesa.

export type EmailProvider = 'resend' | 'smtp'

export interface EmailConfig {
  provider: EmailProvider | null
  fromAddress: string
  fromName: string
  resendApiKey: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const settings = await getSettings(createAdminClient())
  const provider = settings.email_provider === 'resend' || settings.email_provider === 'smtp'
    ? settings.email_provider
    : null
  return {
    provider,
    fromAddress: settings.email_from_address || '',
    fromName: settings.email_from_name || '',
    resendApiKey: settings.resend_api_key || '',
    smtpHost: settings.smtp_host || '',
    smtpPort: Number(settings.smtp_port) || 587,
    smtpSecure: settings.smtp_secure === '1' || settings.smtp_secure === 'true',
    smtpUser: settings.smtp_user || '',
    smtpPassword: settings.smtp_password || '',
  }
}

// Erro específico (em vez de genérico) pra as rotas que chamam sendEmail()
// poderem devolver uma mensagem acionável ("configure em Configurações" em
// vez de "Internal Server Error").
export class EmailNaoConfiguradoError extends Error {
  constructor() {
    super('E-mail não configurado. Configure o provedor em Configurações → E-mail.')
    this.name = 'EmailNaoConfiguradoError'
  }
}

interface EnviarEmailInput {
  to: string
  subject: string
  text: string
  // replyTo aponta pro e-mail de QUEM originou a conversa (ex.: visitante
  // que preencheu o Fale Conosco) — assim, se o destinatário apertar
  // "Responder" no cliente de e-mail dele, a resposta vai pro remetente
  // certo, não pro from_address genérico do domínio.
  replyTo?: string
}

// BUG CORRIGIDO (auditoria de segurança, achado revisando este arquivo):
// assunto e nome do remetente podem conter quebra de linha se vierem sem
// sanitização (ex.: um "Assunto" de contact_messages com \r\n embutido
// permitiria injetar cabeçalhos SMTP extras — CRLF injection clássico).
// Tanto a API do Resend quanto o nodemailer escapam isso internamente, mas
// remover a quebra de linha aqui também é defesa em profundidade barata.
function semQuebraDeLinha(v: string): string {
  return v.replace(/[\r\n]+/g, ' ').trim()
}

export async function sendEmail({ to, subject, text, replyTo }: EnviarEmailInput): Promise<void> {
  // BUG CORRIGIDO (revisão de segurança adversarial): getEmailConfig() lê
  // platform_settings via getSettings(), que relança o erro do
  // PostgREST/Postgres cru (`error.message`) se a query falhar — sem este
  // try/catch, esse texto (potencialmente com detalhe de schema/RLS/infra)
  // vazava direto até a resposta HTTP das rotas que chamam sendEmail(),
  // diferente do resto desta função, que sempre sanitiza antes de relançar.
  let config: EmailConfig
  try {
    config = await getEmailConfig()
  } catch (err) {
    logError(err, { context: 'sendEmail:getEmailConfig' })
    throw new Error('Falha ao carregar a configuração de e-mail.')
  }
  if (!config.provider || !config.fromAddress) throw new EmailNaoConfiguradoError()

  const assunto = semQuebraDeLinha(subject).slice(0, 200)
  const remetente = config.fromName
    ? `${semQuebraDeLinha(config.fromName)} <${config.fromAddress}>`
    : config.fromAddress

  if (config.provider === 'resend') {
    if (!config.resendApiKey) throw new EmailNaoConfiguradoError()
    // BUG CORRIGIDO (revisão de segurança adversarial): só o caso `!res.ok`
    // (resposta HTTP de erro) era sanitizado — uma falha do próprio fetch()
    // (DNS, TLS, timeout, antes de qualquer Response existir) escapava sem
    // try/catch, inconsistente com o branch SMTP logo abaixo, que já
    // protege transporter.sendMail() da mesma forma.
    let res: Response
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: remetente,
          to: [to],
          subject: assunto,
          text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      })
    } catch (err) {
      logError(err, { context: 'sendEmail:resend:fetch' })
      throw new Error('Falha ao enviar e-mail via Resend.')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logError(new Error(`Resend respondeu ${res.status}`), { context: 'sendEmail:resend', body: body.slice(0, 500) })
      throw new Error('Falha ao enviar e-mail via Resend.')
    }
    return
  }

  // provider === 'smtp'
  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) throw new EmailNaoConfiguradoError()
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  })
  try {
    await transporter.sendMail({
      from: remetente,
      to,
      subject: assunto,
      text,
      ...(replyTo ? { replyTo } : {}),
    })
  } catch (err) {
    logError(err, { context: 'sendEmail:smtp' })
    throw new Error('Falha ao enviar e-mail via SMTP — confira host/porta/usuário/senha.')
  }
}
