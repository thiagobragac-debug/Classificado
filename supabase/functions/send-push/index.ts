import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.4";

serve(async (req) => {
  // Configuração de CORS (importante para o navegador)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const { subscription, payload } = await req.json();

    if (!subscription || !payload) {
      throw new Error("Parâmetros 'subscription' e 'payload' são obrigatórios.");
    }

    // Configurando as chaves VAPID a partir das variáveis de ambiente do Supabase
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:contato@seusite.com",
      Deno.env.get("VAPID_PUBLIC_KEY") || "",
      Deno.env.get("VAPID_PRIVATE_KEY") || ""
    );

    // Constrói o objeto de inscrição no formato exigido pela lib
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    // Envia a notificação Push
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));

    return new Response(JSON.stringify({ success: true, message: "Push enviado!" }), {
      headers,
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers,
      status: 400,
    });
  }
});
