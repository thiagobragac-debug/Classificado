import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Alimenta o bloco "Uso de Recursos" em /admin (app/(admin)/admin/page.tsx) —
// números reais de tamanho de banco/storage, direto do Postgres/Supabase
// Storage, via as duas funções da migration 20260907231500_admin_uso_recursos.
async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: caller } = await supabase
    .from('user_secrets')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  return { erro: null }
}

export async function GET() {
  const { erro } = await exigirAdmin()
  if (erro) return erro

  const admin = createAdminClient()
  const [dbRes, storageRes] = await Promise.all([
    admin.rpc('admin_db_usage').single(),
    admin.rpc('admin_storage_usage'),
  ])

  if (dbRes.error) return NextResponse.json({ error: 'Falha ao ler uso do banco: ' + dbRes.error.message }, { status: 500 })
  if (storageRes.error) return NextResponse.json({ error: 'Falha ao ler uso de armazenamento: ' + storageRes.error.message }, { status: 500 })

  const buckets = (storageRes.data || []) as { bucket_id: string; bytes: number; object_count: number }[]
  const storageTotalBytes = buckets.reduce((acc, b) => acc + Number(b.bytes || 0), 0)

  return NextResponse.json({
    dbTotalBytes: Number((dbRes.data as any)?.total_bytes || 0),
    dbTotalRows: Number((dbRes.data as any)?.total_rows || 0),
    dbTables: (dbRes.data as any)?.tables || [],
    storageTotalBytes,
    storageBuckets: buckets,
  })
}
