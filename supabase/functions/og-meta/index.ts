import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  const url = new URL(req.url)
  const adId = url.searchParams.get('id')
  
  const baseUrl = Deno.env.get('SITE_URL') || 'https://tauze.class'

  if (!adId) {
    return new Response(null, {
      status: 302,
      headers: { Location: baseUrl }
    })
  }

  const { data: ad } = await supabase
    .from('ads')
    .select('id, title_pt, price, images')
    .eq('id', adId)
    .single()

  if (!ad) {
    return new Response(null, {
      status: 302,
      headers: { Location: baseUrl }
    })
  }

  const title = ad.title_pt || 'Anúncio'
  const imgUrl = (ad.images && ad.images.length > 0) ? ad.images[0] : 'https://placehold.co/1200x630?text=Sem+Foto'
  let priceStr = 'Consulte'
  if (ad.price) {
    priceStr = `R$ ${Number(ad.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }
  
  const desc = `Preço: ${priceStr} - Veja mais detalhes no Classificado.`
  const adUrl = `${baseUrl}/anuncio.html?id=${ad.id}`

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <!-- Open Graph / Facebook / WhatsApp -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${adUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${imgUrl}">
    
    <!-- Redireciona o usuário real (se acessar sem ser robô) -->
    <meta http-equiv="refresh" content="0; url=${adUrl}">
</head>
<body>
    <p>Redirecionando para <a href="${adUrl}">${title}</a>...</p>
</body>
</html>
  `

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  })
})
