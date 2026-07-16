import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// O mesmo padrão de roteamento
const ACTIVE_GATEWAY = Deno.env.get("ACTIVE_GATEWAY") || "mercadopago"; 

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Precisa de Service Role para bypass RLS
    )

    let ad_id = '';
    let plan_id = '';

    if (ACTIVE_GATEWAY === 'mercadopago') {
      const url = new URL(req.url);
      const topic = url.searchParams.get('topic') || url.searchParams.get('type');
      
      // O webhook real manda payload no body
      let payload;
      try {
        payload = await req.json();
      } catch(e) {
        payload = {};
      }

      const paymentId = url.searchParams.get('data.id') || payload?.data?.id;

      if (!paymentId || (topic !== 'payment' && payload.type !== 'payment')) {
        return new Response('Ignorado', { status: 200 });
      }

      const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
      
      // Busca os detalhes do pagamento no Mercado Pago para validar
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${mpToken}`
        }
      });
      const paymentData = await paymentRes.json();

      if (paymentData.status === 'approved') {
        const externalRef = paymentData.external_reference; // ex: uuid|||7_days
        if (externalRef) {
          [ad_id, plan_id] = externalRef.split('|||');
        }
      } else {
        return new Response('Pagamento não aprovado ainda', { status: 200 });
      }
    } else if (ACTIVE_GATEWAY === 'stripe') {
      throw new Error('Adaptador Stripe ainda não configurado para webhooks.');
    } else if (ACTIVE_GATEWAY === 'asaas') {
      throw new Error('Adaptador Asaas ainda não configurado para webhooks.');
    } else if (ACTIVE_GATEWAY === 'pagarme') {
      throw new Error('Adaptador Pagar.me ainda não configurado para webhooks.');
    }

    // Se temos um ad_id aprovado, atualizamos o banco (Bypass RLS com service role)
    if (ad_id) {
      const { error } = await supabaseClient
        .from('ads')
        .update({ featured: true })
        .eq('id', ad_id);

      if (error) throw error;
      
      // Opcional: Gravar na tabela 'payments' para extrato do usuário
      console.log(`Anúncio ${ad_id} promovido com sucesso pelo plano ${plan_id}.`);
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Erro no webhook:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 }
    )
  }
})
