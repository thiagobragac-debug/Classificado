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

// ============================================================== EXECUÇÃO (aviso antes da 1ª cobrança cheia)
try {
  console.log('== RUN ' + RUN + ' (cron notify-upcoming-renewals) ==');
  await loadPlans();
  const NOTIFY = '/api/internal/notify-upcoming-renewals';
  const a0 = await cron(NOTIFY, null); check('N.0', 'sem Authorization => 401', 401, a0.status);
  const dia = 86400e3;
  async function sub(tag, { periodoEmDias, criadaHaDias, cancelaNoFim = false, ciclo = 'monthly' }) {
    const u = await newUser(tag);
    const r = await buy(u, ciclo === 'annual' ? 'Premium' : 'Produtor PRO', { cycle: ciclo });
    await webhookPaid(r.row, { eventSuffix: 'act' }); await sleep(500);
    await sb('subscriptions?id=eq.' + r.checkoutId, { method: 'PATCH', body: { created_at: new Date(Date.now() - criadaHaDias * dia).toISOString(), current_period_end: new Date(Date.now() + periodoEmDias * dia).toISOString(), cancel_at_period_end: cancelaNoFim } });
    return { u, r, chave: d => 'notice:renewal:' + r.checkoutId + ':' + d.toISOString().slice(0, 10) };
  }
  const dentro = await sub('dentro', { periodoEmDias: 5, criadaHaDias: 25 });                              // mensal, a 5d da 1ª renovação cheia
  const fora = await sub('fora', { periodoEmDias: 20, criadaHaDias: 10 });                                 // longe demais da renovação
  const cancela = await sub('cancela', { periodoEmDias: 5, criadaHaDias: 25, cancelaNoFim: true });        // vai cancelar sozinho
  const segunda = await sub('segunda', { periodoEmDias: 5, criadaHaDias: 70 });                            // já renovou antes
  const anualFora = await sub('anualfora', { periodoEmDias: 100, criadaHaDias: 265, ciclo: 'annual' });    // anual: janela é 30d
  const anualDentro = await sub('anualdentro', { periodoEmDias: 20, criadaHaDias: 345, ciclo: 'annual' });
  const ev = async id => (await sb('webhook_events?id=like.notice:renewal:' + id + '*&select=id')).json?.length || 0;

  const run1 = await cron(NOTIFY); check('N.1', 'cron com auth => 200', 200, run1.status);
  note('N.2', 'resposta do 1º run', run1.json);
  check('N.3', 'candidatos = só os elegíveis (mensal em 5d + anual em 20d)', 2, run1.json?.candidatos);
  const semEmail = !run1.json?.enviados;
  note('N.4', 'enviados=0 significa staging SEM provedor de e-mail (o aviso falha e a chave é liberada)', { enviados: run1.json?.enviados, falhas: run1.json?.falhas });
  if (semEmail) {
    check('N.5', 'envio falhou: chave de idempotência LIBERADA (a próxima execução tenta de novo)', [0, 0], [await ev(dentro.r.checkoutId), await ev(anualDentro.r.checkoutId)]);
  } else {
    check('N.5', 'enviado: chave registrada (1 aviso por assinatura)', [1, 1], [await ev(dentro.r.checkoutId), await ev(anualDentro.r.checkoutId)]);
    const run2 = await cron(NOTIFY); check('N.6', '2º run no mesmo dia: não reenvia', [0, 2], [run2.json?.enviados, run2.json?.jaAvisados]);
  }
  check('N.7', 'fora da janela / cancelando / 2ª renovação / anual distante: sem aviso', [0, 0, 0, 0], [await ev(fora.r.checkoutId), await ev(cancela.r.checkoutId), await ev(segunda.r.checkoutId), await ev(anualFora.r.checkoutId)]);

  // simula "já avisado": insere a chave e confere que conta em jaAvisados e não reenvia
  const fim = new Date((await subRow(dentro.r.checkoutId)).current_period_end);
  await sb('webhook_events', { method: 'POST', body: { id: dentro.chave(fim), gateway: 'internal', event_type: 'renewal_notice' } });
  const run3 = await cron(NOTIFY); check('N.8', 'assinatura já avisada entra em jaAvisados e não é reenviada', 1, run3.json?.jaAvisados);
  for (const x of [dentro, anualDentro]) await sb('webhook_events?id=like.notice:renewal:' + x.r.checkoutId + '*', { method: 'DELETE' });
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
