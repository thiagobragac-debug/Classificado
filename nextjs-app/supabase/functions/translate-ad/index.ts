import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edge Function para ser chamada via Database Webhook sempre que um Anúncio for inserido
serve(async (req) => {
  try {
    const payload = await req.json();
    const ad = payload.record;

    if (!ad || payload.type !== 'INSERT') {
      return new Response("Not an insert", { status: 200 });
    }

    // A lógica real utilizaria uma API como OpenAI ou DeepL:
    // const translated = await fetch('https://api.openai.com/v1/chat/completions', { ... })
    
    // Mock de tradução:
    const mockTranslatedTitle = ad.title_pt ? `${ad.title_pt} (Traduzido ao Espanhol)` : null;
    const mockTranslatedDesc = ad.description ? `(ES) ${ad.description}` : null;

    // Conectar de volta ao Supabase para atualizar o registro
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await supabaseClient
      .from('ads')
      .update({
        title_es: mockTranslatedTitle,
        // Caso queira traduzir também a descrição, pode criar a coluna correspondente
      })
      .eq('id', ad.id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
