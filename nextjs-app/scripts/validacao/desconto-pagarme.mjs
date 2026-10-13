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
async function webhookPaid(row, { eventSuffix = 'a', novaFatura = false } = {}) {
  const inv0 = (await pgFirstInvoiceAmount(row.gateway_subscription_id)).invoice;
  if (!inv0) return { status: 0, json: 'sem fatura' };
  const inv = novaFatura ? { ...inv0, id: 'in_' + rnd() + rnd() } : inv0;
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

// ============================================================== EXECUÇÃO
try {
  console.log(`== RUN ${RUN} | app=${APP} | staging=${U.slice(8, 14)}… ==`);
  // ---- S0 preflight
  const h = await app('/api/health'); check('S0.1', 'app local saudável', 200, h.status);
  check('S0.2', 'flag da promo ligada no staging', '1', S.promo_primeiro_ciclo_ativo);
  await loadPlans();
  check('S0.3', 'planos PRO e Premium existem (staging)', true, !!(PLANS['Produtor PRO'] && PLANS['Premium']));
  check('S0.4', 'preços de partida PRO=79 Premium=149 sem promotional_price', [79, 149, null, null], [Number(PLANS['Produtor PRO'].price), Number(PLANS['Premium'].price), PLANS['Produtor PRO'].promotional_price, PLANS['Premium'].promotional_price]);
  const pgPing = await pg('/subscriptions?size=1'); check('S0.5', 'sandbox Pagar.me acessível', 200, pgPing.status);
  if (h.status !== 200 || pgPing.status !== 200) throw new Error('pré-requisitos falharam');

  // ---- A: PRO mensal, promo automática
  const uA = await newUser('A');
  const initA = await app('/api/checkout/init', { method: 'POST', token: uA.token, body: { planId: PLANS['Produtor PRO'].id, billingCycle: 'monthly' } });
  note('A.0', 'resposta de /api/checkout/init (preview)', { status: initA.status, promoAtiva: initA.json?.promoAtiva, fullPrice: initA.json?.fullPrice, unitPrice: initA.json?.unitPrice, currency: initA.json?.currency || initA.json?.displayCurrency });
  const A = await buy(uA, 'Produtor PRO');
  check('A.1', 'PRO mensal c/ promo: HTTP 200', 200, A.res.status);
  check('A.2', 'subscriptions.price = 39.50 (50% de 79)', 39.5, Number(A.row?.price));
  check('A.3', 'promo_first_cycle_pending = true e promo_full_price = 79', [true, 79], [A.row?.promo_first_cycle_pending, Number(A.row?.promo_full_price)]);
  if (A.row?.gateway_subscription_id) {
    const ip = await pgItemPrice(A.row.gateway_subscription_id); check('A.4', 'Pagar.me: preço do item (centavos) = 3950, intervalo month', [3950, 'month'], [ip.price, ip.interval]);
    const inv = await pgFirstInvoiceAmount(A.row.gateway_subscription_id); check('A.5', 'Pagar.me: 1ª fatura cobrada = 3950 centavos', 3950, inv.amount); note('A.5b', 'status da 1ª fatura no sandbox', inv.status);
    const wh = await webhookPaid(A.row, { eventSuffix: 'activate' }); check('A.6', 'webhook invoice.paid aceito (200)', 200, wh.status); if (wh.status !== 200) note('A.6b', 'corpo', wh.json);
    await sleep(800);
    const a2 = await subRow(A.checkoutId); const sc = await secrets(uA.id);
    check('A.7', 'após webhook: status = active', 'active', a2?.status); check('A.8', 'entitlement: user_secrets.plan = pro', 'pro', sc?.plan);
    check('A.9', 'após ativação a promo continua pendente (reajuste ainda não ocorreu)', true, a2?.promo_first_cycle_pending);
  }

  // ---- B: Premium anual
  const uB = await newUser('B');
  const B = await buy(uB, 'Premium', { cycle: 'annual' });
  check('B.1', 'Premium anual: HTTP 200', 200, B.res.status);
  const annualFull = Math.round(149 * 0.8 * 12 * 100) / 100; // 1430.40
  check('B.2', 'price = 50% de 1430.40 = 715.20', 715.2, Number(B.row?.price));
  check('B.3', 'promo_full_price = 1430.40 (preço cheio anual)', annualFull, Number(B.row?.promo_full_price));
  if (B.row?.gateway_subscription_id) {
    const ip = await pgItemPrice(B.row.gateway_subscription_id); check('B.4', 'Pagar.me: item = 71520 centavos, intervalo year', [71520, 'year'], [ip.price, ip.interval]);
    const inv = await pgFirstInvoiceAmount(B.row.gateway_subscription_id); check('B.5', 'Pagar.me: fatura anual cobrada = 71520', 71520, inv.amount);
    await webhookPaid(B.row, { eventSuffix: 'activate' }); await sleep(600);
    check('B.6', 'Premium anual ativa e entitlement premium', ['active', 'premium'], [(await subRow(B.checkoutId))?.status, (await secrets(uB.id))?.plan]);
  }

  // ---- C: matriz cupom x promo (PRO mensal: cheio 79, promo 39.50)
  const cases = [
    { tag: 'P30', type: 'percentage', val: 30, expPrice: 39.5, expPromo: true, expUsed: 0, why: '30% => 55.30; promo 39.50 vence; cupom NÃO consome uso' },
    { tag: 'P70', type: 'percentage', val: 70, expPrice: 23.7, expPromo: false, expUsed: 1, why: '70% => 23.70; cupom vence; consome 1 uso; sem reajuste' },
    { tag: 'F20', type: 'fixed', val: 20, expPrice: 39.5, expPromo: true, expUsed: 0, why: 'R$20 => 59; promo vence' },
    { tag: 'F50', type: 'fixed', val: 50, expPrice: 29, expPromo: false, expUsed: 1, why: 'R$50 => 29; cupom vence' },
    { tag: 'P50', type: 'percentage', val: 50, expPrice: 39.5, expPromo: true, expUsed: 0, why: 'empate 50%: promo vence de propósito (reversível)' },
  ];
  const cpState = {};
  for (const c of cases) {
    const u = await newUser('C' + c.tag); const cp = await mkCoupon(c.tag, c.type, c.val);
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code });
    check(`C.${c.tag}.1`, `cupom ${c.type} ${c.val} (${c.why}) preço`, c.expPrice, Number(r.row?.price));
    check(`C.${c.tag}.2`, 'promo_first_cycle_pending', c.expPromo, r.row?.promo_first_cycle_pending);
    check(`C.${c.tag}.3`, 'usage_count do cupom', c.expUsed, await couponUses(cp.id));
    if (r.row?.gateway_subscription_id) { const ip = await pgItemPrice(r.row.gateway_subscription_id); check(`C.${c.tag}.4`, 'Pagar.me item = preço final em centavos', Math.round(c.expPrice * 100), ip.price); }
    cpState[c.tag] = { u, r, cp };
  }

  // ---- C6: cupom 100% (bypass local)
  { const u = await newUser('C100'); const cp = await mkCoupon('P100', 'percentage', 100);
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code });
    check('C.P100.1', 'cupom 100%: HTTP 200 e gateway local (sem cobrança)', [200, 'local'], [r.res.status, r.res.json?.gateway]);
    note('C.P100.2', 'linha da assinatura (cupom 100%)', { status: r.row?.status, price: r.row?.price, gw: r.row?.gateway, gwSub: r.row?.gateway_subscription_id, promoPending: r.row?.promo_first_cycle_pending });
    check('C.P100.3', 'entitlement liberado na hora', 'pro', (await secrets(u.id))?.plan); }

  // ---- C7: cartão recusado com cupom que venceria -> uso do cupom revertido, lock removido
  { const u = await newUser('Cdecl'); const cp = await mkCoupon('DECL', 'percentage', 70);
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code, cvv: '600' });
    check('C.DECL.1', 'cartão recusado: HTTP 402', 402, r.res.status);
    check('C.DECL.2', 'uso do cupom revertido (0)', 0, await couponUses(cp.id));
    check('C.DECL.3', 'lock removido (sem linha pendente)', null, await subRow(r.checkoutId)); }

  // ---- D: adulteração de preço pelo cliente
  { const u = await newUser('D'); const r = await buy(u, 'Produtor PRO', { extra: { finalPrice: 1, price: 1, discount: 99, promoAtiva: true, promo_full_price: 1 } });
    check('D.1', 'adulteração (finalPrice=1): RECUSADA com 409 price_changed, nada cobrado (o servidor cobraria mais que o exibido)', [409, null], [r.res.status, r.row]);
    const r2 = await buy(u, 'Produtor PRO', { extra: { price: 1, discount: 99, promoAtiva: true, promo_full_price: 1 } });
    check('D.2', 'campos de preço/desconto enviados pelo cliente são ignorados (cobra 39.50, full=79)', [39.5, 79], [Number(r2.row?.price), Number(r2.row?.promo_full_price)]); }

  // ---- D2: F06 — guard de preço alterado (servidor cobraria MAIS que o exibido)
  { const u = await newUser('D2');
    await setFlag('0');
    const r1 = await buy(u, 'Produtor PRO', { extra: { finalPrice: 39.5 } });
    check('D2.1', 'modal mostrou 39.50 mas a promo foi desligada (cobraria 79): 409 price_changed, NADA cobrado', [409, 'price_changed'], [r1.res.status, r1.res.json?.code]);
    check('D2.2', 'mensagem traz o novo valor', true, /79,00/.test(String(r1.res.json?.error)));
    check('D2.3', 'sem lock/assinatura criada', null, r1.row);
    await setFlag('1');
    // cliente que exibe MAIS que o servidor cobraria (ex.: Android mostrando 79 sem a promo): permitido
    const r2 = await buy(u, 'Produtor PRO', { extra: { finalPrice: 79 } });
    check('D2.4', 'cliente exibiu 79 e o servidor cobra 39.50 (menos): NÃO bloqueia', [200, 39.5], [r2.res.status, Number(r2.row?.price)]);
    const r3 = await buy(await newUser('D2b'), 'Produtor PRO', { extra: { finalPrice: 39.5 } });
    check('D2.5', 'valor exibido == cobrado: segue normal', [200, 39.5], [r3.res.status, Number(r3.row?.price)]); }

  // ---- D3: elegibilidade — /api/promo/elegibilidade e init
  { const anon = await app('/api/promo/elegibilidade'); check('D3.1', 'elegibilidade sem login => 401', 401, anon.status);
    const u = await newUser('D3'); const e0 = await app('/api/promo/elegibilidade', { token: u.token }); check('D3.2', 'usuário novo é elegível', true, e0.json?.elegivel);
    const r = await buy(u, 'Produtor PRO'); await webhookPaid(r.row, { eventSuffix: 'activate' }); await sleep(500);
    const e1 = await app('/api/promo/elegibilidade', { token: u.token }); check('D3.3', 'com assinatura ativa => não elegível', false, e1.json?.elegivel);
    await app('/api/subscriptions/cancel', { method: 'POST', token: u.token, body: {} }); await sleep(16000);
    const e2 = await app('/api/promo/elegibilidade', { token: u.token }); check('D3.4', 'depois de CANCELAR continua não elegível (já consumiu)', false, e2.json?.elegivel);
    const ini = await app('/api/checkout/init', { method: 'POST', token: u.token, body: { planId: PLANS['Produtor PRO'].id, billingCycle: 'monthly' } });
    check('D3.5', 'init para quem já consumiu: promoAtiva=false', false, ini.json?.promoAtiva);
    const r2 = await buy(u, 'Produtor PRO'); check('D3.6', 'F01 CORRIGIDO: reassinar após cancelar cobra o preço CHEIO (79) e sem promo', [79, false], [Number(r2.row?.price), r2.row?.promo_first_cycle_pending]); }
  { // checkout abandonado (pending nunca ativado) NÃO consome a promo
    const u = await newUser('D3c'); const cp = await mkCoupon('D3C', 'percentage', 70);
    const bad = await buy(u, 'Produtor PRO', { cvv: '600' }); check('D3.7', 'cartão recusado (402)', 402, bad.res.status);
    const ok = await buy(u, 'Produtor PRO'); check('D3.8', 'recusa anterior não consome a promo: próxima compra paga 39.50', 39.5, Number(ok.row?.price)); }

  // ---- D4: F02 integrado — mesmo pagamento, eventos distintos
  { const u = await newUser('D4'); const r = await buy(u, 'Produtor PRO');
    await webhookPaid(r.row, { eventSuffix: 'e1' }); await sleep(600);
    const fim1 = (await subRow(r.checkoutId))?.current_period_end;
    const w2 = await webhookPaid(r.row, { eventSuffix: 'e2' }); await sleep(600);
    const w3 = await webhookPaid(r.row, { eventSuffix: 'e3' }); await sleep(600);
    const fim3 = (await subRow(r.checkoutId))?.current_period_end;
    check('D4.1', 'F02 CORRIGIDO: eventos 2 e 3 da MESMA fatura aceitos (200) mas sem estender o período', [200, 200, fim1], [w2.status, w3.status, fim3]);
    const novo = await webhookPaid(r.row, { eventSuffix: 'e4', novaFatura: true }); await sleep(600);
    const fim4 = (await subRow(r.checkoutId))?.current_period_end;
    check('D4.2', 'fatura NOVA (renovação real) estende o período normalmente (+1 mês)', true, new Date(fim4) > new Date(fim1)); }

  // ---- E: flag desligada
  await setFlag('0');
  { const u = await newUser('E'); const ini = await app('/api/checkout/init', { method: 'POST', token: u.token, body: { planId: PLANS['Produtor PRO'].id, billingCycle: 'monthly' } });
    check('E.1', 'init com flag=0: promoAtiva=false', false, ini.json?.promoAtiva);
    const r = await buy(u, 'Produtor PRO'); check('E.2', 'flag=0: cobra preço cheio 79', 79, Number(r.row?.price)); check('E.3', 'flag=0: sem estado promocional', [false, null], [r.row?.promo_first_cycle_pending, r.row?.promo_full_price]); }
  await setFlag('1');

  // ---- F: promotional_price x promo
  async function setPromoPrice(planName, v) { await sb(`plans?id=eq.${PLANS[planName].id}`, { method: 'PATCH', body: { promotional_price: v } }); }
  await setPromoPrice('Produtor PRO', 59);
  { const u = await newUser('F59'); const r = await buy(u, 'Produtor PRO');
    check('F.1', 'promotional_price=59 + promo: cobra 39.50 (Math.min, não 29.50)', 39.5, Number(r.row?.price)); check('F.2', 'promo_full_price = 79 (cheio, não 59)', 79, Number(r.row?.promo_full_price)); }
  await setPromoPrice('Produtor PRO', 30);
  { const u = await newUser('F30'); const r = await buy(u, 'Produtor PRO');
    check('F.3', 'promotional_price=30 (<50%): cobra 30', 30, Number(r.row?.price)); check('F.4', 'promo não venceu: sem estado promocional', false, r.row?.promo_first_cycle_pending); }
  await setPromoPrice('Produtor PRO', null);

  // ---- G: cron de reajuste
  const noAuth = await cron('/api/internal/reconcile-promo-pricing', null); check('G.1', 'cron sem Authorization => 401', 401, noAuth.status);
  const badAuth = await cron('/api/internal/reconcile-promo-pricing', 'Bearer errado'); check('G.2', 'cron com segredo errado => 401', 401, badAuth.status);
  const qsAuth = await cron('/api/internal/reconcile-promo-pricing', null, '?secret=' + encodeURIComponent(CRON)); check('G.3', 'segredo correto na query string NÃO autentica => 401', 401, qsAuth.status);
  const beforeA = await subRow(A.checkoutId), beforeB = await subRow(B.checkoutId);
  const run1 = await cron('/api/internal/reconcile-promo-pricing'); check('G.4', 'cron com segredo correto => 200', 200, run1.status);
  const resById = Object.fromEntries((run1.json?.results || []).map(x => [x.id, x]));
  check('G.5', 'cron reajustou A (PRO mensal)', 'reajustado', resById[A.checkoutId]?.reason);
  check('G.6', 'cron reajustou B (Premium anual)', 'reajustado', resById[B.checkoutId]?.reason);
  const aft = await subRow(A.checkoutId), bft = await subRow(B.checkoutId);
  check('G.7', 'A: banco price=79 e pending=false', [79, false], [Number(aft?.price), aft?.promo_first_cycle_pending]);
  check('G.8', 'B: banco price=1430.40 e pending=false', [annualFull, false], [Number(bft?.price), bft?.promo_first_cycle_pending]);
  const ipA = await pgItemPrice(A.row.gateway_subscription_id); check('G.9', 'A: Pagar.me item agora 7900 (próxima fatura cheia)', 7900, ipA.price);
  const ipB = await pgItemPrice(B.row.gateway_subscription_id); check('G.10', 'B: Pagar.me item agora 143040', 143040, ipB.price);
  const invA = await pgFirstInvoiceAmount(A.row.gateway_subscription_id); check('G.11', '1ª fatura de A permanece 3950 (reajuste não cobra nada)', 3950, invA.amount);
  const run2 = await cron('/api/internal/reconcile-promo-pricing'); const r2 = (run2.json?.results || []).map(x => x.id);
  check('G.12', 'idempotência: 2ª execução não reprocessa A nem B', [false, false], [r2.includes(A.checkoutId), r2.includes(B.checkoutId)]);
  note('G.13', 'cron processou também (outros pendentes do teste)', { processed: run1.json?.processed, reasons: [...new Set((run1.json?.results || []).map(x => x.reason))] });

  // ---- H: reajuste por webhook de renovação (sem cron)
  { const u = await newUser('H'); const r = await buy(u, 'Produtor PRO');
    if (r.row?.gateway_subscription_id) {
      await webhookPaid(r.row, { eventSuffix: 'activate' }); await sleep(500);
      const ren = await webhookPaid(r.row, { eventSuffix: 'renewal', novaFatura: true }); await sleep(1200);
      const row = await subRow(r.checkoutId); const ip = await pgItemPrice(r.row.gateway_subscription_id);
      check('H.1', 'webhook de renovação aceito', 200, ren.status);
      check('H.2', 'renovação reajusta: banco price=79 pending=false', [79, false], [Number(row?.price), row?.promo_first_cycle_pending]);
      check('H.3', 'renovação reajusta: Pagar.me item = 7900', 7900, ip.price);
      note('H.4', 'tentativas/erro do reajuste', { attempts: row?.promo_reajuste_attempts, lastError: row?.promo_reajuste_last_error });
      // webhook duplicado (mesmo evento reenviado) não pode quebrar nada
      const dup = await webhookPaid(r.row, { eventSuffix: 'renewal2', novaFatura: true }); await sleep(600);
      check('H.5', 'segundo webhook de renovação não reajusta de novo nem erra', [200, 79], [dup.status, Number((await subRow(r.checkoutId))?.price)]);
    } }

  // ---- I: concorrência / idempotência
  { const u = await newUser('I'); const cid = crypto.randomUUID();
    const [t1, t2] = [await pgToken(), await pgToken()];
    const body = tok => ({ checkoutId: cid, planId: PLANS['Produtor PRO'].id, billingCycle: 'monthly', paymentMethod: 'card', billingData: { name: 'Suite', doc: '52998224725', phone: '11999999999' }, billingAddress: { cep: '01310100', street: 'Av Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'Sao Paulo', state: 'SP' }, gatewayToken: tok });
    const [r1, r2x] = await Promise.all([app('/api/checkout', { method: 'POST', token: u.token, body: body(t1) }), app('/api/checkout', { method: 'POST', token: u.token, body: body(t2) })]);
    const subs = (await sb(`subscriptions?user_id=eq.${u.id}&select=id,gateway_subscription_id,status`)).json || [];
    subs.forEach(s => s.gateway_subscription_id && T.pgSubs.add(s.gateway_subscription_id));
    const statuses = [r1.status, r2x.status].sort();
    check('I.1', 'mesmo checkoutId em paralelo: só UMA assinatura criada no banco', 1, subs.length);
    check('I.2', 'uma resposta 200 e a outra 429', [200, 429], statuses);
    const pgList = (await pg('/subscriptions?customer_id=' + (subs[0]?.gateway_customer_id || 'x'))).json; note('I.3', 'assinaturas no Pagar.me p/ o cliente (se disponível)', Array.isArray(pgList?.data) ? pgList.data.length : 'n/d'); }
  { const u = await newUser('I2');
    const [ra, rb] = await Promise.all([buy(u, 'Produtor PRO'), buy(u, 'Produtor PRO')]);
    const subs = (await sb(`subscriptions?user_id=eq.${u.id}&select=id,gateway_subscription_id,status`)).json || [];
    subs.forEach(s => s.gateway_subscription_id && T.pgSubs.add(s.gateway_subscription_id));
    check('I.4', 'checkoutIds DIFERENTES, mesmo plano, em paralelo: só uma cobrança real (janela de 15s)', 1, subs.filter(s => s.gateway_subscription_id).length);
    note('I.5', 'respostas', [ra.res.status, rb.res.status]); }

  // ---- J: abuso — cancelar e reassinar repete a promo?
  { const cancel = await app('/api/subscriptions/cancel', { method: 'POST', token: uA.token, body: {} });
    check('J.1', 'cancelamento pelo usuário: HTTP 200', 200, cancel.status);
    const row = await subRow(A.checkoutId); note('J.2', 'linha após cancelar', { status: row?.status, pending: row?.promo_first_cycle_pending, full: row?.promo_full_price });
    check('J.3', 'cancelamento limpa estado promocional', [false, null], [row?.promo_first_cycle_pending, row?.promo_full_price]);
    const gw = await pgItemPrice(A.row.gateway_subscription_id); check('J.4', 'Pagar.me: assinatura cancelada', 'canceled', gw.subStatus);
    await sleep(16000); // sai da janela anti-duplo-clique de 15s
    const again = await buy(uA, 'Produtor PRO');
    note('J.5', 'REASSINATURA do mesmo usuário após cancelar (abuso de elegibilidade)', { http: again.res.status, price: again.row?.price, promoPending: again.row?.promo_first_cycle_pending });
    check('J.6', 'a promoção NÃO deveria se repetir para quem já a usou (esperado preço cheio 79)', 79, Number(again.row?.price)); }

  // ---- K: troca de plano (PRO ativo -> Premium) não herda a promo
  { const u = await newUser('K'); const r = await buy(u, 'Produtor PRO');
    if (r.row?.gateway_subscription_id) {
      await webhookPaid(r.row, { eventSuffix: 'activate' }); await sleep(500);
      await sleep(16000);
      const sw = await buy(u, 'Premium');
      check('K.1', 'troca PRO->Premium: HTTP 200', 200, sw.res.status);
      check('K.2', 'troca não ganha promo: cobra 149 cheio', 149, Number(sw.row?.price));
      check('K.3', 'troca: sem estado promocional na nova', [false, null], [sw.row?.promo_first_cycle_pending, sw.row?.promo_full_price]);
      const old = await subRow(r.checkoutId); note('K.4', 'assinatura antiga após troca', { status: old?.status, pending: old?.promo_first_cycle_pending, full: old?.promo_full_price });
      check('K.5', 'antiga com estado promocional limpo (não será "reajustada" pelo plano errado)', [false, null], [old?.promo_first_cycle_pending, old?.promo_full_price]);
    } }

  // ---- L: segurança dos crons restantes
  const ex1 = await cron('/api/internal/enforce-plan-expiration', null); check('L.1', 'enforce-plan-expiration sem auth => 401', 401, ex1.status);
  const ex2 = await cron('/api/internal/expire-stale-subscriptions', null); check('L.2', 'expire-stale-subscriptions sem auth => 401', 401, ex2.status);
  const ex3 = await cron('/api/internal/enforce-ad-quota-deadlines', null); check('L.3', 'enforce-ad-quota-deadlines sem auth => 401', 401, ex3.status);
  const ex4 = await cron('/api/internal/enforce-plan-expiration', 'Bearer errado'); check('L.4', 'enforce-plan-expiration com segredo errado => 401', 401, ex4.status);

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
