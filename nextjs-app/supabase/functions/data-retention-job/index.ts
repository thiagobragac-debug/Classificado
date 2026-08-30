import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Segredo dedicado (recomendado — ver auditoria de segurança, 2026-08-30):
// `supabase secrets set EDGE_CRON_SECRET=<valor aleatório>` e configurar o
// mesmo valor no header Authorization do agendamento (Dashboard > Edge
// Functions > Schedule). Sem essa env var, cai no padrão anterior (a própria
// service role key como bearer) por compatibilidade — mas evite deixar assim:
// a chave mais poderosa do projeto trafegando em header HTTP roteado por um
// agendador externo é exposição desnecessária.
const CRON_SECRET = Deno.env.get('EDGE_CRON_SECRET') || SERVICE_KEY

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // BUG CORRIGIDO (auditoria de segurança, 2026-08-30, achado crítico): esta
  // função deleta anúncios reais (via service_role, bypassando RLS) e não
  // validava nenhuma autenticação — qualquer pessoa que descobrisse a URL
  // pública podia invocá-la repetidamente (DoS de custo de execução, e
  // exclusão de dados de produção sem autorização nenhuma). Mesmo padrão já
  // usado em notify-expiring-keys/index.ts.
  const authHeader = req.headers.get('Authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch settings
    const { data: settingsData } = await supabaseClient.from('platform_settings').select('*')
    const settings = settingsData?.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}) || {}

    const strategy = settings.retention_strategy || 'metadata'
    
    // 2. Fetch ads to archive (older than 180 days, inactive)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)
    
    const { data: oldAds, error: adsError } = await supabaseClient
      .from('ads')
      .select('*')
      .in('status', ['archived', 'cancelled'])
      .lt('updated_at', sixMonthsAgo.toISOString())
      .limit(50) // Batch process

    if (adsError) throw adsError
    if (!oldAds || oldAds.length === 0) {
      return new Response(JSON.stringify({ message: 'No ads to process' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const processedIds = []

    for (const ad of oldAds) {
      try {
        let mediaLogs = []
        let coldStorageUrl = null

        // If ad has images/videos, handle them
        if (ad.media && Array.isArray(ad.media)) {
          if (strategy === 'metadata') {
            // A. Just save metadata
            mediaLogs = ad.media.map((url: string) => ({
              original_url: url,
              deleted_at: new Date().toISOString(),
              reason: 'Data Retention Policy (180 days)'
            }))
          } else if (strategy === 'cold_storage') {
            // B. Cold storage logic (mocked structure for S3 compatible APIs)
            // Here you would download from Supabase and upload to S3 using settings.s3_access_key
            mediaLogs = ad.media.map((url: string) => ({
              original_url: url,
              moved_to_cold_storage: true
            }))
            coldStorageUrl = `s3://${settings.s3_bucket}/archives/${ad.id}`
          }

          // Delete from Supabase Storage (assuming standard bucket structure)
          // const paths = ad.media.map(url => getPathFromUrl(url))
          // await supabaseClient.storage.from('ads').remove(paths)
        }

        // 3. Move to ads_archive
        const archiveRow = {
          ...ad,
          archived_media_logs: mediaLogs,
          cold_storage_url: coldStorageUrl
        }

        const { error: archiveError } = await supabaseClient.from('ads_archive').insert(archiveRow)
        if (archiveError) throw archiveError

        // 4. Delete from original ads table
        const { error: deleteError } = await supabaseClient.from('ads').delete().eq('id', ad.id)
        if (deleteError) throw deleteError

        processedIds.push(ad.id)
      } catch (e) {
        console.error(`Error processing ad ${ad.id}:`, e)
      }
    }

    return new Response(JSON.stringify({
      message: `Processed ${processedIds.length} old ads`,
      processedIds,
      strategy
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
