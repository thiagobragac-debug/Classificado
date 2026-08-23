import crypto from 'crypto'

/**
 * Comparação de assinatura em tempo constante.
 *
 * `esperada !== recebida` vaza informação pelo tempo de resposta: a comparação
 * de strings para no primeiro byte diferente, então um atacante consegue medir
 * quantos bytes iniciais acertou e forjar a assinatura byte a byte. Em rede
 * pública o ruído torna o ataque difícil, mas não é motivo para deixar aberto —
 * a versão segura custa a mesma linha de código.
 */
export function assinaturaConfere(esperada: string, recebida: string | undefined | null): boolean {
  if (!recebida) return false

  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(recebida, 'utf8')

  // timingSafeEqual exige buffers do mesmo tamanho. O tamanho em si não é
  // segredo (é o comprimento fixo de um hex de SHA-256).
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

/**
 * Rejeita webhook fora da janela de tolerância.
 *
 * A assinatura sozinha só prova autenticidade, não frescor: uma requisição
 * legítima capturada continua válida para sempre e pode ser reenviada. A
 * tabela `webhook_events` já barra o reprocessamento do mesmo event_id, mas
 * essa checagem fecha a janela antes de qualquer trabalho ser feito.
 *
 * Aceita segundos (Stripe, Mercado Pago) ou milissegundos.
 */
export function timestampRecente(ts: string | undefined | null, toleranciaSegundos = 300): boolean {
  if (!ts) return false

  const valor = Number(ts)
  if (!Number.isFinite(valor) || valor <= 0) return false

  // Acima de ~1973 em ms; abaixo disso o valor está em segundos.
  const emMs = valor > 1e11 ? valor : valor * 1000

  return Math.abs(Date.now() - emMs) <= toleranciaSegundos * 1000
}
