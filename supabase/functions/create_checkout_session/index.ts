import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// Padrão Multi-Gateway: Define o gateway ativo
const ACTIVE_GATEWAY = Deno.env.get("ACTIVE_GATEWAY") || "mercadopago"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Obter o usuário logado via header de autorização
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) throw new Error('Usuário não autenticado')

    const { ad_id, plan_id } = await req.json()

    // Validação do anúncio
    const { data: ad, error: adError } = await supabaseClient
      .from('ads')
      .select('id, title_pt, user_id')
      .eq('id', ad_id)
      .single()

    if (adError || !ad) throw new Error('Anúncio não encontrado')
    if (ad.user_id !== user.id) throw new Error('Não autorizado')

    // Valores fixos baseados no plano
    let price = 0;
    let description = '';
    if (plan_id === '7_days') {
      price = 19.90;
      description = 'Turbinar Anúncio: 7 Dias em Destaque';
    } else if (plan_id === '30_days') {
      price = 49.90;
      description = 'Turbinar Anúncio: 30 Dias em Destaque';
    } else {
      throw new Error('Plano inválido');
    }

    let checkoutUrl = '';

    // Arquitetura Abstract Factory: Roteamento
    if (ACTIVE_GATEWAY === 'mercadopago') {
      // Implementação Mercado Pago
      const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
      if (!mpToken) throw new Error('Chave do Mercado Pago não configurada no servidor.');

      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mpToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [
            {
              title: description,
              description: ad.title_pt,
              picture_url: 'https://tauzeclass.com.br/assets/icon-boost.png',
              category_id: 'services',
              quantity: 1,
              currency_id: 'BRL',
              unit_price: price
            }
          ],
          external_reference: ad_id + '|||' + plan_id,
          back_urls: {
            success: 'https://tauzeclass.com.br/painel.html?payment=success',
            failure: 'https://tauzeclass.com.br/painel.html?payment=failure',
            pending: 'https://tauzeclass.com.br/painel.html?payment=pending'
          },
          auto_return: 'approved',
          notification_url: 'https://seusupabase.functions.supabase.co/payment_webhook' // Substituir pelo domínio real depois
        })
      });

      const mpData = await response.json();
      checkoutUrl = mpData.init_point;

    } else if (ACTIVE_GATEWAY === 'stripe') {
      throw new Error('Adaptador Stripe ainda não configurado.');
    } else if (ACTIVE_GATEWAY === 'asaas') {
      throw new Error('Adaptador Asaas ainda não configurado.');
    } else if (ACTIVE_GATEWAY === 'pagarme') {
      throw new Error('Adaptador Pagar.me ainda não configurado.');
    }

    return new Response(
      JSON.stringify({ url: checkoutUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
