import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Lista usuários para o admin (Gerenciar Usuários).
//
// BUG CORRIGIDO: a página fazia essa consulta direto do browser com
// getSupabase() (cliente anon, sujeito a RLS). A RLS de user_secrets só
// libera auth.uid() = id — ou seja, o admin só via o PRÓPRIO user_secrets,
// e o join `user_secrets(is_blocked, plan, email)` vinha `null` para
// qualquer outro usuário. Resultado real: "Assinantes" sempre mostrava 0 e
// nenhum usuário real (fora o próprio admin) jamais tinha seu plano/status
// de bloqueio exibidos corretamente, mesmo com assinaturas pagas de
// verdade no banco. Mesmo motivo pelo qual /api/admin/block-user já existe
// como rota de servidor em vez de escrita direta do browser.
function planLabel(raw: string | null | undefined) {
  const p = (raw || '').toLowerCase()
  if (p === 'premium') return 'Premium'
  if (p === 'pro') return 'Pro'
  return 'Grátis'
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // BUG CORRIGIDO: a rota trazia até 1.500 perfis de uma vez e a página
  // filtrava/paginava tudo em memória — acima disso, usuários mais antigos
  // somem da lista em silêncio. Agora busca/filtro/paginação rodam de
  // verdade no servidor via .range(); `export=true` ignora a paginação
  // (usado só pelo botão "Exportar CSV", que precisa de todos os
  // resultados filtrados, não só da página atual).
  const url = new URL(request.url)

  // KPIs do topo da tela: contagens globais, não afetadas pelo filtro/busca
  // atual — mesmo padrão já usado no dashboard e em /admin/denuncias.
  if (url.searchParams.get('counts') === 'true') {
    const admin = createAdminClient()
    const [totalRes, blockedRes, proRes, premiumRes] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('user_secrets').select('*', { count: 'exact', head: true }).eq('is_blocked', true),
      admin.from('user_secrets').select('*', { count: 'exact', head: true }).eq('plan', 'pro'),
      admin.from('user_secrets').select('*', { count: 'exact', head: true }).eq('plan', 'premium'),
    ])
    const firstError = [totalRes, blockedRes, proRes, premiumRes].find(r => r.error)?.error
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })
    const total = totalRes.count || 0
    const assinantes = (proRes.count || 0) + (premiumRes.count || 0)
    return NextResponse.json({ total, assinantes, free: total - assinantes, blocked: blockedRes.count || 0 })
  }

  const isExport = url.searchParams.get('export') === 'true'
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '15') || 15))
  const search = url.searchParams.get('search')?.trim() || ''
  const status = url.searchParams.get('status') || '' // 'blocked' | 'active'
  const country = url.searchParams.get('country')?.trim() || ''
  const plan = url.searchParams.get('plan') || '' // 'free' | 'pro' | 'premium'

  const admin = createAdminClient()

  // status/plan vivem em user_secrets, não em profiles — o PostgREST não
  // combina OR entre colunas de tabelas diferentes numa query só, então
  // resolvemos os IDs que batem em user_secrets primeiro (mesma técnica já
  // usada em /admin/denuncias para anúncio+denunciante).
  let secretIds: string[] | null = null
  if (status || plan) {
    let sq = admin.from('user_secrets').select('id')
    if (status === 'blocked') sq = sq.eq('is_blocked', true)
    if (status === 'active') sq = sq.eq('is_blocked', false)
    if (plan === 'pro') sq = sq.eq('plan', 'pro')
    if (plan === 'premium') sq = sq.eq('plan', 'premium')
    if (plan === 'free') sq = sq.or('plan.eq.free,plan.is.null')
    const { data: secretRows, error: secretErr } = await sq.limit(20000)
    if (secretErr) return NextResponse.json({ error: secretErr.message }, { status: 500 })
    secretIds = (secretRows || []).map((r: any) => r.id)
    if (secretIds.length === 0) {
      return NextResponse.json({ users: [], total: 0 })
    }
  }

  // Busca por nome (profiles) OU e-mail (user_secrets) — mesma técnica.
  let emailMatchIds: string[] = []
  if (search) {
    const { data: emailMatches } = await admin.from('user_secrets').select('id').ilike('email', `%${search}%`).limit(5000)
    emailMatchIds = (emailMatches || []).map((r: any) => r.id)
  }

  let q = admin.from('profiles').select('*, user_secrets(is_blocked, plan, email), ads(count)', { count: 'exact' })
  if (country) q = q.ilike('country', `%${country}%`)
  if (secretIds) q = q.in('id', secretIds)
  if (search) {
    const orParts = [`name.ilike.%${search}%`]
    if (emailMatchIds.length) orParts.push(`id.in.(${emailMatchIds.join(',')})`)
    q = q.or(orParts.join(','))
  }
  q = q.order('created_at', { ascending: false })

  if (isExport) {
    q = q.limit(20000)
  } else {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    q = q.range(from, to)
  }

  const { data, count, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (data || []).map((u: any) => ({
    ...u,
    is_blocked: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.is_blocked : u.user_secrets?.is_blocked,
    plan: planLabel(Array.isArray(u.user_secrets) ? u.user_secrets[0]?.plan : u.user_secrets?.plan),
    email: Array.isArray(u.user_secrets) ? u.user_secrets[0]?.email : u.user_secrets?.email,
    ads_count: Array.isArray(u.ads) ? u.ads[0]?.count : (u.ads?.count || 0),
    user_secrets: undefined,
    ads: undefined,
  }))

  return NextResponse.json({ users, total: count ?? users.length })
}
