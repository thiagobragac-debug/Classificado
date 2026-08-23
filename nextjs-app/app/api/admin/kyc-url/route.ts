import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Emite URLs assinadas e de vida curta para os documentos de uma solicitação
// de verificação.
//
// O painel exibia `<img src={document_front}>` com o valor gravado no banco,
// que vinha de storage.getPublicUrl() sobre um bucket PRIVADO — ou seja, uma
// URL que sempre responde 403. Na prática nenhum documento de verificação era
// visível para o admin.
//
// A correção não é tornar o bucket público: documento de identidade e selfie
// não podem ficar acessíveis por URL adivinhável. O caminho certo é guardar o
// path e assinar sob demanda, autenticando o admin no servidor.

const BUCKET = 'kyc-docs'
const TTL_SEGUNDOS = 300

// Aceita tanto o path novo ("<uid>/123_front.jpg") quanto os valores legados,
// que gravavam a URL pública inteira.
function extrairPath(valor: string | null): string | null {
  if (!valor) return null
  if (!valor.startsWith('http')) return valor

  const marcadores = ['/object/public/kyc-docs/', '/object/public/kyc-documents/', '/object/sign/kyc-docs/']
  for (const m of marcadores) {
    const i = valor.indexOf(m)
    if (i > -1) return valor.slice(i + m.length).split('?')[0]
  }
  return null // URL externa (ex.: placeholder de teste) — não é do nosso storage
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  let body: { requestId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { requestId } = body
  if (typeof requestId !== 'string' || !requestId) {
    return NextResponse.json({ error: '`requestId` é obrigatório' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Os paths saem do registro, nunca do corpo da requisição: assim não há como
  // pedir assinatura de um objeto arbitrário do bucket.
  const { data: req, error } = await admin
    .from('verification_requests')
    .select('document_front, document_back, selfie')
    .eq('id', requestId)
    .single()

  if (error || !req) {
    return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
  }

  const campos = ['document_front', 'document_back', 'selfie'] as const
  const urls: Record<string, string | null> = {}

  for (const campo of campos) {
    const bruto = (req as Record<string, string | null>)[campo]
    const path = extrairPath(bruto)

    if (!path) {
      // Valor que não é do nosso storage (legado/placeholder): devolve como veio.
      urls[campo] = bruto && bruto.startsWith('http') ? bruto : null
      continue
    }

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL_SEGUNDOS)
    urls[campo] = signed?.signedUrl ?? null
  }

  return NextResponse.json({ urls, expiresIn: TTL_SEGUNDOS })
}
