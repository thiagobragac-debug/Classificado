import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get('invoice_id');
  const country = searchParams.get('country') || 'BR';
  const method = searchParams.get('method') || 'stripe'; // Default

  if (!invoiceId) {
    return NextResponse.json({ error: 'Fatura não informada' }, { status: 400 });
  }

  // ─── GATEWAY ROUTING ────────────────────────────────────────────────────────
  
  // TODO: Em um ambiente real, aqui instanciaríamos os SDKs de pagamento:
  // let checkoutUrl = '';
  // 
  // if (country === 'BR') {
  //   if (method === 'pagarme') {
  //     checkoutUrl = await pagarmeClient.createCheckout(...);
  //   } else if (method === 'stripe') {
  //     checkoutUrl = await stripe.checkout.sessions.create(...);
  //   } else if (method === 'asaas') {
  //     checkoutUrl = await asaasClient.createPayment(...);
  //   } else {
  //     checkoutUrl = await mercadopago.preferences.create(...);
  //   }
  // } else {
  //   // MERCOSUL / OUTROS
  //   if (method === 'mercadopago') {
  //     checkoutUrl = await mercadopago.preferences.create(...);
  //   } else {
  //     checkoutUrl = await stripe.checkout.sessions.create(...);
  //   }
  // }
  
  // ─── MODO DE SIMULAÇÃO (DEV) ────────────────────────────────────────────────
  
  // Redirecionamos o usuário de volta para o painel com ?payment=success 
  // e o ID da fatura, simulando o retorno de sucesso do gateway.
  
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/painel?payment=success&invoice_id=${invoiceId}`;
  
  // No Next.js API Route para redirecionar um GET, retornamos Response.redirect
  return Response.redirect(successUrl);
}
