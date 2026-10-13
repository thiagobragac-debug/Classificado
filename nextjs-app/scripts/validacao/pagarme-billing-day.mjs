import { readFileSync } from 'node:fs'; import crypto from 'node:crypto';
const env = Object.fromEntries(readFileSync(process.env.ENV_FILE,'utf8').split(/\r?\n/).filter(l=>/^[A-Z0-9_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim()]}));
const U=env.NEXT_PUBLIC_SUPABASE_URL,SVC=env.SUPABASE_SERVICE_ROLE_KEY; if(!U.includes('aksbtlhjabffmmnancms')) process.exit(2);
const S=Object.fromEntries((await (await fetch(`${U}/rest/v1/platform_settings?select=key,value`,{headers:{apikey:SVC,authorization:`Bearer ${SVC}`}})).json()).map(r=>[r.key,r.value]));
const AUTH='Basic '+Buffer.from(S.pagarme_api_key+':').toString('base64'); const made=[];
for (const day of [28,29,30,31]) {
  const tk=await (await fetch(`https://api.pagar.me/core/v5/tokens?appId=${S.pagarme_pub_key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'card',card:{number:'4000000000000010',holder_name:'TESTE BD',exp_month:12,exp_year:2031,cvv:'123'}})})).json();
  const body={payment_method:'credit_card',interval:'month',interval_count:1,billing_type:'exact_day',billing_day:day,items:[{description:'teste billing_day',quantity:1,pricing_scheme:{price:3950}}],customer:{name:'Teste BD',email:`bd${day}-${crypto.randomBytes(3).toString('hex')}@teste.tauzeclass.invalid`,type:'individual',document:'52998224725',document_type:'CPF',phones:{mobile_phone:{country_code:'55',area_code:'11',number:'999999999'}}},card_token:tk.id,card:{billing_address:{line_1:'1000, Av Paulista, Bela Vista',zip_code:'01310100',city:'Sao Paulo',state:'SP',country:'BR'}},metadata:{teste:'billing_day'}};
  const r=await fetch('https://api.pagar.me/core/v5/subscriptions',{method:'POST',headers:{authorization:AUTH,'content-type':'application/json','Idempotency-Key':'bd-'+day+'-'+crypto.randomBytes(4).toString('hex')},body:JSON.stringify(body)});
  const j=await r.json(); if(j.id) made.push(j.id);
  console.log('billing_day',day,'-> http',r.status, j.id?{status:j.status,next_billing_at:j.next_billing_at,billing_day:j.billing_day}:JSON.stringify(j).slice(0,220));
  if(j.id){const inv=await (await fetch('https://api.pagar.me/core/v5/invoices?subscription_id='+j.id,{headers:{authorization:AUTH}})).json(); console.log('   1ª fatura:',JSON.stringify((inv.data||[]).map(x=>({amount:x.amount,status:x.status,created:x.created_at}))));}
}
for(const id of made){const d=await fetch('https://api.pagar.me/core/v5/subscriptions/'+id,{method:'DELETE',headers:{authorization:AUTH,'content-type':'application/json'},body:JSON.stringify({cancel_pending_invoices:true})}); console.log('cancelada',id,d.status)}
console.log('hoje (UTC):',new Date().toISOString(),'| hoje (BRT):',new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()));
