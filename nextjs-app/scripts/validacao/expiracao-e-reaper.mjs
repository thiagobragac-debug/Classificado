// E2E do processo de desconto contra STAGING (Supabase staging + sandbox Pagar.me), app local na porta 3000.
// Dados 100% descartáveis, limpeza garantida em finally. Nenhuma chamada a produção.
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

const ENV_FILE = process.env.ENV_FILE;
const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, CRON = env.CRON_SECRET_STAGING;
if (!U || !U.includes('aksbtlhjabffmmnancms')) { console.error('ABORTADO: URL não é a do staging.'); process.exit(2); }
const APP = 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = () => crypto.randomBytes(4).toString('hex');
const RUN = 'suite' + rnd();

// -------------------------------------------------------------- helpers REST
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
}
const settingsRows = (await sb('platform_settings?select=key,value')).json;
const S = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
const PG_AUTH = 'Basic ' + Buffer.from(S.pagarme_api_key + ':').toString('base64');
async function pg(path, { method = 'GET', body } = {}) {
  const r = await fetch('https://api.pagar.me/core/v5' + path, { method, headers: { authorization: PG_AUTH, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
}
async function app(path, { method = 'GET', token, body, headers = {} } = {}) {
  const r = await fetch(APP + path, { method, headers: { 'content-type': 'application/json', origin: APP, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); }
  return { status: r.status, json: j };
}

// -------------------------------------------------------------- coleta de resultados
const R = [];
const eq = (e, a) => (typeof e === 'number' && typeof a === 'number') ? Math.abs(e - a) < 0.005 : JSON.stringify(e) === JSON.stringify(a);
function check(id, desc, exp, act, ok = eq) {
  const pass = ok(exp, act); R.push({ id, desc, exp, act, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}  | esperado=${JSON.stringify(exp)}  obtido=${JSON.stringify(act)}`);
}
function note(id, desc, info) { R.push({ id, desc, info, pass: null }); console.log(`NOTE  ${id}  ${desc}  | ${typeof info === 'string' ? info : JSON.stringify(info)}`); }

// -------------------------------------------------------------- rastreio para limpeza
const T = { users: [], pgSubs: new Set(), coupons: [], planSnap: {}, flagOriginal: S.promo_primeiro_ciclo_ativo };

async function newUser(tag) {
  const email = `${RUN}-${tag}@teste.tauzeclass.invalid`, password = 'Tz!' + crypto.randomBytes(9).toString('base64url');
  const r = await fetch(`${U}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Suite ' + tag } }) });
  const j = await r.json(); if (!j.id) throw new Error('falha criando usuário: ' + JSON.stringify(j).slice(0, 200));
  T.users.push(j.id);
  for (let i = 0; i < 10; i++) { const p = await sb(`profiles?id=eq.${j.id}&select=id`); if (p.json?.length) break; await sleep(300); }
  await sb(`profiles?id=eq.${j.id}`, { method: 'PATCH', body: { country: 'BR', name: 'Suite ' + tag } });
  const tk = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const tj = await tk.json(); if (!tj.access_token) throw new Error('falha no token: ' + JSON.stringify(tj).slice(0, 200));
  return { id: j.id, email, token: tj.access_token };
}

let PLANS = {};
async function loadPlans() {
  const p = (await sb('plans?select=id,name,price,promotional_price,price_usd,promotional_price_usd&is_active=eq.true')).json;
  PLANS = Object.fromEntries(p.map(x => [x.name, x]));
  T.planSnap = Object.fromEntries(p.map(x => [x.id, { promotional_price: x.promotional_price, promotional_price_usd: x.promotional_price_usd }]));
}
async function pgToken(cvv = '123') {
  const r = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${S.pagarme_pub_key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'card', card: { number: '4000000000000010', holder_name: 'TESTE SUITE', exp_month: 12, exp_year: 2031, cvv } }) });
  const j = await r.json(); if (!j.id) throw new Error('tokenização falhou: ' + JSON.stringify(j).slice(0, 200)); return j.id;
}
async function buy(user, planName, { cycle = 'monthly', coupon = null, cvv = '123', extra = {}, checkoutId = crypto.randomUUID() } = {}) {
  const gatewayToken = await pgToken(cvv);
  const res = await app('/api/checkout', {
    method: 'POST', token: user.token,
    body: { checkoutId, planId: PLANS[planName].id, billingCycle: cycle, paymentMethod: 'card', couponCode: coupon, billingData: { name: 'Suite Teste', doc: '52998224725', phone: '11999999999' }, billingAddress: { cep: '01310100', street: 'Av Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'Sao Paulo', state: 'SP' }, gatewayToken, ...extra },
  });
  const row = (await sb(`subscriptions?id=eq.${checkoutId}&select=*`)).json?.[0] || null;
  if (row?.gateway_subscription_id) T.pgSubs.add(row.gateway_subscription_id);
  return { res, row, checkoutId };
}
const subRow = async id => (await sb(`subscriptions?id=eq.${id}&select=*`)).json?.[0] || null;
const secrets = async uid => (await sb(`user_secrets?id=eq.${uid}&select=plan,plan_id`)).json?.[0] || null;
async function pgItemPrice(gwId) { const r = await pg('/subscriptions/' + gwId); return { status: r.status, price: r.json?.items?.[0]?.pricing_scheme?.price, interval: r.json?.interval, subStatus: r.json?.status }; }
async function pgFirstInvoiceAmount(gwId) { const r = await pg('/invoices?subscription_id=' + gwId); const d = r.json?.data || []; return { n: d.length, amount: d[0]?.amount, status: d[0]?.status, invoice: d[0] }; }
async function webhookPaid(row, { eventSuffix = 'a' } = {}) {
  const inv = (await pgFirstInvoiceAmount(row.gateway_subscription_id)).invoice;
  if (!inv) return { status: 0, json: 'sem fatura' };
  const ev = { id: `hook_${RUN}_${eventSuffix}_${rnd()}`, type: 'invoice.paid', created_at: new Date().toISOString(), data: inv };
  const r = await fetch(`${APP}/api/webhooks/payments/pagarme`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(S.pagarme_webhook_secret, 'utf8').toString('base64') }, body: JSON.stringify(ev) });
  const t = await r.text(); return { status: r.status, json: t.slice(0, 160) };
}
const cron = async (path, auth = `Bearer ${CRON}`, qs = '') => app(path + qs, { headers: auth === null ? {} : { authorization: auth } });
async function setFlag(v) { await sb('platform_settings?key=eq.promo_primeiro_ciclo_ativo', { method: 'PATCH', body: { value: v } }); }
async function mkCoupon(tag, type, value, extra = {}) {
  const code = `SUITE_${RUN.toUpperCase()}_${tag}`.slice(0, 40);
  const r = await sb('coupons', { method: 'POST', prefer: 'return=representation', body: { code, discount_type: type, discount_value: value, is_active: true, usage_count: 0, max_uses: 50, ...extra } });
  if (!r.json?.[0]?.id) throw new Error('falha criando cupom: ' + JSON.stringify(r.json).slice(0, 200));
  T.coupons.push(r.json[0].id); return { code, id: r.json[0].id };
}
const couponUses = async id => (await sb(`coupons?id=eq.${id}&select=usage_count`)).json?.[0]?.usage_count;

// ============================================================== EXECUÇÃO (cenário M corrigido + extras)
try {
  console.log('== RUN '+RUN+' (M corrigido) ==');
  const h = await app('/api/health'); check('S0.1','app local saudável',200,h.status);
  await loadPlans();
  // M: plano vencido há >24h por profiles.plan_expires_at (é o que o cron lê)
  const u = await newUser('M'); const r = await buy(u,'Produtor PRO');
  await webhookPaid(r.row,{eventSuffix:'activate'}); await sleep(600);
  const p0 = (await sb('profiles?id=eq.'+u.id+'&select=plan_expires_at,subscription_status,plan_id')).json?.[0];
  note('M.0','estado após ativação (profiles)',p0);
  check('M.1','pré: plano pro e promo pendente',['pro',true],[(await secrets(u.id))?.plan,(await subRow(r.checkoutId))?.promo_first_cycle_pending]);
  // 1) sem vencer: o cron não pode mexer
  const ex0 = await cron('/api/internal/enforce-plan-expiration'); check('M.2','plano em dia: cron não rebaixa ninguém deste teste','pro',(await secrets(u.id))?.plan);
  // 2) vencido há 12h (dentro da margem de 24h): NÃO rebaixa
  await sb('profiles?id=eq.'+u.id,{method:'PATCH',body:{plan_expires_at:new Date(Date.now()-12*3600e3).toISOString()}});
  await cron('/api/internal/enforce-plan-expiration'); check('M.3','vencido há 12h (margem 24h): ainda pro','pro',(await secrets(u.id))?.plan);
  // 3) vencido há 48h: rebaixa
  await sb('profiles?id=eq.'+u.id,{method:'PATCH',body:{plan_expires_at:new Date(Date.now()-48*3600e3).toISOString()}});
  const ex = await cron('/api/internal/enforce-plan-expiration'); note('M.4','resposta do cron',ex.json);
  check('M.5','vencido há 48h: rebaixado para free','free',(await secrets(u.id))?.plan);
  const row = await subRow(r.checkoutId); check('M.6','assinatura vira expired e estado promocional limpo',['expired',false,null],[row?.status,row?.promo_first_cycle_pending,row?.promo_full_price]);
  const pf = (await sb('profiles?id=eq.'+u.id+'&select=plan_expires_at,subscription_status,plan_id')).json?.[0]; check('M.7','profiles: plan_id nulo, status expired',[null,'expired'],[pf?.plan_id,pf?.subscription_status]);
  // 4) idempotência
  const ex2 = await cron('/api/internal/enforce-plan-expiration'); note('M.8','2a execução',ex2.json);
  // 5) o gateway ainda cobra? (assinatura no Pagar.me continua viva — o cron só mexe no banco)
  const gw = await pgItemPrice(r.row.gateway_subscription_id); note('M.9','Pagar.me após expiração local (assinatura ainda cobrando?)',{subStatus:gw.subStatus});
  // N2: expire-stale também limpa promo? (observação)
  const u2 = await newUser('N2'); const r2 = await buy(u2,'Produtor PRO');
  await sb('subscriptions?id=eq.'+r2.checkoutId,{method:'PATCH',body:{created_at:new Date(Date.now()-3*3600e3).toISOString()}});
  await cron('/api/internal/expire-stale-subscriptions'); await sleep(1200);
  const rr = await subRow(r2.checkoutId); check('N2.1','pendente travada vira expired (por desenho)','expired',rr?.status); note('N2.2','estado promocional que sobra na linha expired (inerte: o cron só lê active/past_due)',{pending:rr?.promo_first_cycle_pending,full:rr?.promo_full_price});
  // N3: reativação pelo admin de linha 'expired' com promo pendente voltaria a ser lida pelo cron de reajuste? (simulação de dado)
  await sb('subscriptions?id=eq.'+r2.checkoutId,{method:'PATCH',body:{status:'active'}});
  const rc = await cron('/api/internal/reconcile-promo-pricing'); const hit=(rc.json?.results||[]).find(x=>x.id===r2.checkoutId); note('N3.1','se uma linha expired com promo pendente for reativada, o cron de reajuste a pega',hit||'não pegou');
} catch (e) {
  console.log('ERRO FATAL NO ROTEIRO:', e.message); R.push({ id: 'FATAL', desc: e.message, pass: false });
} finally {
  // ============================================================ LIMPEZA
  console.log('\n== LIMPEZA ==');
  try { await setFlag(T.flagOriginal ?? '1'); } catch {}
  for (const [id, v] of Object.entries(T.planSnap)) { try { await sb(`plans?id=eq.${id}`, { method: 'PATCH', body: v }); } catch {} }
  const cancelled = []; for (const gw of T.pgSubs) { try { const r = await pg('/subscriptions/' + gw, { method: 'DELETE', body: { cancel_pending_invoices: true } }); cancelled.push(r.status); } catch {} }
  for (const id of T.coupons) { try { await sb(`coupons?id=eq.${id}`, { method: 'DELETE' }); } catch {} }
  for (const uid of T.users) { try { await sb(`subscriptions?user_id=eq.${uid}`, { method: 'DELETE' }); } catch {} }
  for (const uid of T.users) { try { await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SVC, authorization: `Bearer ${SVC}` } }); } catch {} }
  await sleep(1500);
  const left = (await sb(`profiles?id=in.(${T.users.join(',')})&select=id`)).json; const leftSubs = (await sb(`subscriptions?user_id=in.(${T.users.join(',')})&select=id`)).json; const leftCp = (await sb(`coupons?code=like.SUITE_${RUN.toUpperCase()}*&select=id`)).json;
  let notCancelled = 0; for (const gw of T.pgSubs) { const r = await pgItemPrice(gw); if (r.subStatus && r.subStatus !== 'canceled') notCancelled++; }
  const flagNow = (await sb('platform_settings?key=eq.promo_primeiro_ciclo_ativo&select=value')).json?.[0]?.value; const plansNow = (await sb('plans?select=name,promotional_price&is_active=eq.true')).json;
  const resid = { usuariosRestantes: left?.length, assinaturasRestantes: leftSubs?.length, cuponsRestantes: leftCp?.length, assinaturasPagarmeNaoCanceladas: notCancelled, pagarmeAssinaturasCriadas: T.pgSubs.size, flagFinal: flagNow, promotionalPriceFinal: plansNow.map(p => p.name + '=' + p.promotional_price) };
  console.log('RESÍDUO:', JSON.stringify(resid));
  const pass = R.filter(r => r.pass === true).length, fail = R.filter(r => r.pass === false);
  console.log(`\n== RESUMO: ${pass} PASS | ${fail.length} FAIL | ${R.filter(r => r.pass === null).length} NOTES ==`);
  for (const f of fail) console.log('  FAIL', f.id, f.desc, '| esperado', JSON.stringify(f.exp), '| obtido', JSON.stringify(f.act));
  writeFileSync(process.env.OUT || 'e2e-results.json', JSON.stringify({ run: RUN, resid, results: R }, null, 1));
}
