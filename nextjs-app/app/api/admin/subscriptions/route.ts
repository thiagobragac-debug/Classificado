import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { flattenOne } from '@/lib/supabase'

// Lista assinaturas para o admin (Gestão de Assinaturas).
//
// BUG CORRIGIDO (validação de 2026-08-26): a página fazia essa consulta
// direto do browser com getSupabase() (cliente anon, sujeito a RLS). A
// RLS de user_secrets só libera auth.uid() = id — o admin só via o
// PRÓPRIO e-mail, e o embed profiles!user_id(user_secrets(email)) vinha
// null para qualquer outro assinante. Coluna "Usuário" sempre mostrava
// "-". Mesmo bug de classe já corrigido para /admin/usuarios
// (app/api/admin/users/route.ts) — nunca tinha sido replicado aqui.
//
// BUG CORRIGIDO (achado de usabilidade — paginação): a rota trazia até 100
// assinaturas de uma vez (`.limit(100)`) e a página paginava/filtrava tudo
// em memória — acima disso, assinaturas mais antigas somem da lista em
// silêncio, igual ao bug já corrigido em /api/admin/users. Agora
// busca/filtro/paginação rodam de verdade no servidor via .range(), mesmo
// padrão usado ali; `counts=true` devolve KPIs globais (contagens + MRR),
// não afetados pela página/filtro atual.
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

  const admin = createAdminClient()
  const url = new URL(request.url)

  // KPIs do topo da tela: contagens/soma globais, não afetadas pelo
  // filtro/busca/página atual — mesmo padrão já usado em /admin/usuarios e
  // /admin/api-keys.
  if (url.searchParams.get('counts') === 'true') {
    const [totalRes, ativosRes, atrasadosRes, canceladosRes, mrrRes] = await Promise.all([
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).neq('status', 'switch_applied'),
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'past_due'),
      // BUG CORRIGIDO (teste de estresse final, 2026-09-02): só contava
      // 'cancelled', sem o estado terminal 'expired' (migration
      // 20260901150000_enforce_plan_expiration_cobre_cancelled.sql) — o KPI
      // "Canceladas" deixava de bater com "total - ativas - atrasadas"
      // assim que a 1ª assinatura expirou (em vez de cancelada pelo
      // usuário), sem nenhuma linha visível pra onde essa diferença foi.
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['cancelled', 'expired']),
      admin.from('subscriptions').select('price, currency, billing_cycle').eq('status', 'active'),
    ])
    const firstError = [totalRes, ativosRes, atrasadosRes, canceladosRes, mrrRes].find(r => r.error)?.error
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })
    // BUG CORRIGIDO (achado ao vivo, 2026-09-01): somar price de assinaturas
    // em moedas diferentes (BRL + USD, ver plans.price_usd) num único número
    // produz um MRR sem sentido (mistura Real com Dólar como se fossem a
    // mesma unidade). Agrupa por moeda; o front mostra um card por moeda com
    // assinatura ativa em vez de um total falso.
    //
    // BUG CORRIGIDO (RESOLVER PROBLEMA DESCONTO ANUAL, achado ao vivo,
    // 2026-09-01): subscriptions.price é o valor EXATO cobrado por ciclo
    // (ver app/api/checkout/route.ts: `price: finalPrice`) — numa assinatura
    // anual isso é o total do ANO (preço mensal com 20% off × 12), não um
    // valor mensal. Somar direto no "MRR" (Monthly Recurring Revenue)
    // inflava a receita mensal de cada assinante anual em até ~12x. Divide
    // por 12 antes de somar quando billing_cycle === 'annual', igual a toda
    // ferramenta de billing (Stripe MRR, por ex.) normaliza receita anual
    // pra base mensal.
    const mrrByCurrency: Record<string, number> = {}
    for (const r of (mrrRes.data || []) as any[]) {
      const cur = r.currency || 'BRL'
      const monthlyEquivalent = r.billing_cycle === 'annual' ? (r.price || 0) / 12 : (r.price || 0)
      mrrByCurrency[cur] = (mrrByCurrency[cur] || 0) + monthlyEquivalent
    }
    return NextResponse.json({
      total: totalRes.count || 0,
      ativos: ativosRes.count || 0,
      atrasados: atrasadosRes.count || 0,
      cancelados: canceladosRes.count || 0,
      mrrByCurrency,
    })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '15') || 15))
  const search = url.searchParams.get('search')?.trim() || ''
  const status = url.searchParams.get('status') || ''

  // Busca por nome (profiles) ou e-mail (user_secrets) — mesma técnica já
  // usada em /admin/usuarios: resolve os IDs de perfil que batem antes, já
  // que o PostgREST não combina OR entre colunas de tabelas diferentes numa
  // query só.
  let matchIds: string[] | null = null
  if (search) {
    const [nameMatches, emailMatches] = await Promise.all([
      admin.from('profiles').select('id').ilike('name', `%${search}%`).limit(5000),
      admin.from('user_secrets').select('id').ilike('email', `%${search}%`).limit(5000),
    ])
    const ids = new Set<string>()
    ;(nameMatches.data || []).forEach((r: any) => ids.add(r.id))
    ;(emailMatches.data || []).forEach((r: any) => ids.add(r.id))
    matchIds = Array.from(ids)
    if (matchIds.length === 0) {
      return NextResponse.json({ subscriptions: [], total: 0 })
    }
  }

  let q = admin
    .from('subscriptions')
    .select('*, profiles!user_id(name, user_secrets(email))', { count: 'exact' })
    // BUG CORRIGIDO (validação do zero, 4ª rodada): 'switch_applied' é o
    // marcador terminal que o lock de idempotência do checkout deixa pra
    // trás depois de uma troca nativa de plano bem-sucedida (nunca mais é
    // apagado, de propósito — ver comentário em app/api/checkout/route.ts).
    // Sem este filtro, cada troca de plano nativa infla "Total" com uma
    // linha zumbi (sem gateway_subscription_id, sem ação disponível) para
    // sempre.
    .neq('status', 'switch_applied')

  if (status) q = q.eq('status', status)
  if (matchIds) q = q.in('user_id', matchIds)

  q = q.order('created_at', { ascending: false })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to)

  const { data, count, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const subscriptions = (data || []).map((sub: any) => ({
    ...sub,
    profiles: sub.profiles ? {
      ...sub.profiles,
      email: flattenOne(sub.profiles.user_secrets)?.email,
      user_secrets: undefined,
    } : null,
  }))

  return NextResponse.json({ subscriptions, total: count ?? subscriptions.length })
}
