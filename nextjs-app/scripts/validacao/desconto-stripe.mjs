// E2E do desconto no caminho STRIPE (usuário internacional, USD) — staging + Stripe modo teste, app local :3000.
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(readFileSync(process.env.ENV_FILE, 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, CRON = env.CRON_SECRET_STAGING;
if (!U || !U.includes('aksbtlhjabffmmnancms')) { console.error('ABORTADO: URL não é a do staging.'); process.exit(2); }
const APP = 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = () => crypto.randomBytes(4).toString('hex');
const RUN = 'stripe' + rnd();

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, json: j };
}
const S = Object.fromEntries((await sb('platform_settings?select=key,value')).json.map(r => [r.key, r.value]));
if (!String(S.stripe_secret_key).startsWith('sk_test_')) { console.error('ABORTADO: chave Stripe do staging não é sk_test_.'); process.exit(2); }
async function st(path, { method = 'GET', form } = {}) {
  const r = await fetch('https://api.stripe.com/v1' + path, { method, headers: { authorization: `Bearer ${S.stripe_secret_key}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, json: j };
}
async function app(path, { method = 'GET', token, body, headers = {} } = {}) {
  const r = await fetch(APP + path, { method, headers: { 'content-type': 'application/json', origin: APP, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); } return { status: r.status, json: j };
}
const R = [];
const eq = (e, a) => (typeof e === 'number' && typeof a === 'number') ? Math.abs(e - a) < 0.005 : JSON.stringify(e) === JSON.stringify(a);
function check(id, desc, exp, act) { const pass = eq(exp, act); R.push({ id, desc, exp, act, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}  | esperado=${JSON.stringify(exp)}  obtido=${JSON.stringify(act)}`); }
function note(id, desc, info) { R.push({ id, desc, info, pass: null }); console.log(`NOTE  ${id}  ${desc}  | ${typeof info === 'string' ? info : JSON.stringify(info)}`); }
const T = { users: [], stSubs: new Set(), stCust: new Set(), coupons: [], planSnap: {}, flag: S.promo_primeiro_ciclo_ativo };

async function newUser(tag, country = 'US') {
  const email = `${RUN}-${tag}@teste.tauzeclass.invalid`, password = 'Tz!' + crypto.randomBytes(9).toString('base64url');
  const r = await fetch(`${U}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Suite ' + tag } }) });
  const j = await r.json(); if (!j.id) throw new Error('falha criando usuário');
  T.users.push(j.id);
  for (let i = 0; i < 10; i++) { const p = await sb(`profiles?id=eq.${j.id}&select=id`); if (p.json?.length) break; await sleep(300); }
  await sb(`profiles?id=eq.${j.id}`, { method: 'PATCH', body: { country, name: 'Suite ' + tag } });
  const tk = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const tj = await tk.json(); if (!tj.access_token) throw new Error('falha no token');
  return { id: j.id, email, token: tj.access_token };
}
let PLANS = {};
async function loadPlans() { const p = (await sb('plans?select=id,name,price,promotional_price,price_usd,promotional_price_usd&is_active=eq.true')).json; PLANS = Object.fromEntries(p.map(x => [x.name, x])); T.planSnap = Object.fromEntries(p.map(x => [x.id, { promotional_price: x.promotional_price, promotional_price_usd: x.promotional_price_usd }])); }
async function buy(user, planName, { cycle = 'monthly', coupon = null, pm = 'pm_card_visa', checkoutId = crypto.randomUUID() } = {}) {
  const res = await app('/api/checkout', { method: 'POST', token: user.token, body: { checkoutId, planId: PLANS[planName].id, billingCycle: cycle, paymentMethod: 'card', couponCode: coupon, billingData: { name: 'Suite Teste', doc: '52998224725', phone: '11999999999' }, gatewayToken: pm } });
  const row = (await sb(`subscriptions?id=eq.${checkoutId}&select=*`)).json?.[0] || null;
  if (row?.gateway_subscription_id) T.stSubs.add(row.gateway_subscription_id); if (row?.gateway_customer_id) T.stCust.add(row.gateway_customer_id);
  return { res, row, checkoutId };
}
const subRow = async id => (await sb(`subscriptions?id=eq.${id}&select=*`)).json?.[0] || null;
const secrets = async uid => (await sb(`user_secrets?id=eq.${uid}&select=plan`)).json?.[0] || null;
async function stSub(id) { const r = await st(`/subscriptions/${id}?expand[]=latest_invoice`); const j = r.json; return { status: j?.status, unit: j?.items?.data?.[0]?.price?.unit_amount, cur: j?.items?.data?.[0]?.price?.currency, interval: j?.items?.data?.[0]?.price?.recurring?.interval, paid: j?.latest_invoice?.amount_paid, invoice: j?.latest_invoice, raw: j }; }
async function upcoming(customer, sub) { const r = await st('/invoices/create_preview', { method: 'POST', form: { customer, subscription: sub } }); return { status: r.status, due: r.json?.amount_due, err: r.json?.error?.message }; }
async function webhook(invoice, reason, tag) {
  const t = Math.floor(Date.now() / 1000); const inv = JSON.parse(JSON.stringify(invoice)); inv.billing_reason = reason;
  const ev = { id: `evt_${RUN}_${tag}_${rnd()}`, object: 'event', type: 'invoice.payment_succeeded', created: t, data: { object: inv } }; const body = JSON.stringify(ev);
  const sig = crypto.createHmac('sha256', S.stripe_webhook_secret).update(`${t}.${body}`).digest('hex');
  const r = await fetch(`${APP}/api/webhooks/payments?gateway=stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}`, 'x-gateway': 'stripe' }, body });
  return { status: r.status, text: (await r.text()).slice(0, 140) };
}
const cron = async (path, auth = `Bearer ${CRON}`) => app(path, { headers: auth === null ? {} : { authorization: auth } });
async function mkCoupon(tag, type, value, extra = {}) { const code = `SUITE_${RUN.toUpperCase()}_${tag}`.slice(0, 40); const r = await sb('coupons', { method: 'POST', prefer: 'return=representation', body: { code, discount_type: type, discount_value: value, is_active: true, usage_count: 0, max_uses: 50, ...extra } }); if (!r.json?.[0]?.id) throw new Error('cupom'); T.coupons.push(r.json[0].id); return { code, id: r.json[0].id }; }
const couponUses = async id => (await sb(`coupons?id=eq.${id}&select=usage_count`)).json?.[0]?.usage_count;

try {
  console.log(`== RUN ${RUN} | Stripe (modo teste) | staging ==`);
  const h = await app('/api/health'); check('S0.1', 'app local saudável', 200, h.status);
  await loadPlans(); check('S0.2', 'USD cadastrado no staging: PRO=15 Premium=29', [15, 29], [Number(PLANS['Produtor PRO'].price_usd), Number(PLANS['Premium'].price_usd)]);
  const bal = await st('/balance'); check('S0.3', 'Stripe (sk_test) acessível', 200, bal.status);
  if (h.status !== 200 || bal.status !== 200) throw new Error('pré-requisitos');

  // ---- A: PRO mensal USD
  const uA = await newUser('A');
  const ini = await app('/api/checkout/init', { method: 'POST', token: uA.token, body: { planId: PLANS['Produtor PRO'].id, billingCycle: 'monthly' } });
  note('A.0', 'init (Stripe/USD)', { status: ini.status, promoAtiva: ini.json?.promoAtiva, unitPrice: ini.json?.unitPrice, fullPrice: ini.json?.fullPrice, currency: ini.json?.currency || ini.json?.displayCurrency, gateway: ini.json?.gateway });
  const A = await buy(uA, 'Produtor PRO');
  check('A.1', 'PRO mensal USD: HTTP 200', 200, A.res.status);
  check('A.2', 'banco: price=7.50 USD (50% de 15)', [7.5, 'USD'], [Number(A.row?.price), A.row?.currency]);
  check('A.3', 'banco: pending=true, promo_full_price=15', [true, 15], [A.row?.promo_first_cycle_pending, Number(A.row?.promo_full_price)]);
  let sA = null;
  if (A.row?.gateway_subscription_id) {
    sA = await stSub(A.row.gateway_subscription_id);
    check('A.4', 'Stripe: item unit_amount=750 usd month', [750, 'usd', 'month'], [sA.unit, sA.cur, sA.interval]);
    check('A.5', 'Stripe: 1ª fatura paga = 750 centavos', 750, sA.paid);
    const up0 = await upcoming(A.row.gateway_customer_id, A.row.gateway_subscription_id);
    note('A.6', 'PRÉ-reajuste: fatura da 2ª renovação (prévia Stripe) — mostra o que seria cobrado se o reajuste não rodasse', up0);
    const wh = await webhook(sA.invoice, 'subscription_create', 'activate'); check('A.7', 'webhook de ativação aceito', 200, wh.status); if (wh.status !== 200) note('A.7b', 'resposta', wh.text);
    await sleep(900); check('A.8', 'ativada + entitlement pro', ['active', 'pro'], [(await subRow(A.checkoutId))?.status, (await secrets(uA.id))?.plan]);
  }

  // ---- B: Premium anual USD
  const uB = await newUser('B'); const B = await buy(uB, 'Premium', { cycle: 'annual' });
  check('B.1', 'Premium anual USD: HTTP 200', 200, B.res.status);
  const fullAnnual = Math.round(29 * 0.8 * 12 * 100) / 100; // 278.40
  check('B.2', 'banco: price=139.20 USD (50% de 278.40), full=278.40', [139.2, fullAnnual], [Number(B.row?.price), Number(B.row?.promo_full_price)]);
  if (B.row?.gateway_subscription_id) { const s = await stSub(B.row.gateway_subscription_id); check('B.3', 'Stripe: unit_amount=13920 usd year e fatura paga=13920', [13920, 'usd', 'year', 13920], [s.unit, s.cur, s.interval, s.paid]); }

  if (B.row?.gateway_subscription_id) { const sB = await stSub(B.row.gateway_subscription_id); await webhook(sB.invoice, 'subscription_create', 'activateB'); await sleep(700); }
  // ---- C: cupom x promo em USD
  { const u = await newUser('Cfix'); const cp = await mkCoupon('FIXBRL', 'fixed', 5); // fixo sem valor USD => sem efeito
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code });
    check('C.1', 'cupom fixo SEM discount_value_usd (R$5) em USD: sem efeito, promo vence => 7.50', 7.5, Number(r.row?.price)); check('C.2', 'cupom sem efeito não consome uso', 0, await couponUses(cp.id)); }
  { const u = await newUser('Cusd'); const cp = await mkCoupon('FIXUSD', 'fixed', 5, { discount_value_usd: 10 }); // 15-10=5 < 7.50
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code });
    check('C.3', 'cupom fixo USD 10 (15-10=5 < 7.50): cupom vence', 5, Number(r.row?.price)); check('C.4', 'cupom vencedor: sem estado promocional e 1 uso', [false, 1], [r.row?.promo_first_cycle_pending, await couponUses(cp.id)]); }
  { const u = await newUser('Cpct'); const cp = await mkCoupon('P30', 'percentage', 30);
    const r = await buy(u, 'Produtor PRO', { coupon: cp.code }); check('C.5', 'cupom 30% (10.50) perde para promo (7.50)', [7.5, 0], [Number(r.row?.price), await couponUses(cp.id)]); }

  // ---- D: promotional_price_usd x promo
  await sb(`plans?id=eq.${PLANS['Produtor PRO'].id}`, { method: 'PATCH', body: { promotional_price_usd: 12 } });
  { const u = await newUser('Dpu'); const r = await buy(u, 'Produtor PRO'); check('D.1', 'promotional_price_usd=12 + promo: 7.50 e full=15 (não 12)', [7.5, 15], [Number(r.row?.price), Number(r.row?.promo_full_price)]); }
  await sb(`plans?id=eq.${PLANS['Produtor PRO'].id}`, { method: 'PATCH', body: { promotional_price_usd: null } });

  // ---- E: recusa
  { const u = await newUser('Edecl'); const r = await buy(u, 'Produtor PRO', { pm: 'pm_card_chargeCustomerFail' });
    check('E.1', 'cartão que falha na cobrança: HTTP 402', 402, r.res.status); check('E.2', 'lock removido', null, await subRow(r.checkoutId)); }

  // ---- F: reajuste via cron (A e B) + prova na fatura futura do Stripe
  const noAuth = await cron('/api/internal/reconcile-promo-pricing', null); check('F.0', 'cron sem auth => 401', 401, noAuth.status);
  const run = await cron('/api/internal/reconcile-promo-pricing'); check('F.1', 'cron 200', 200, run.status);
  const by = Object.fromEntries((run.json?.results || []).map(x => [x.id, x]));
  check('F.2', 'cron reajustou A e B (Stripe)', ['reajustado', 'reajustado'], [by[A.checkoutId]?.reason, by[B.checkoutId]?.reason]);
  if (A.row?.gateway_subscription_id) {
    const s = await stSub(A.row.gateway_subscription_id); check('F.3', 'A: Stripe item agora 1500 usd (cheio)', [1500, 'usd'], [s.unit, s.cur]);
    const up1 = await upcoming(A.row.gateway_customer_id, A.row.gateway_subscription_id); check('F.4', 'A: PRÓXIMA fatura prevista pelo Stripe = 1500 (preço cheio)', 1500, up1.due); if (up1.err) note('F.4b', 'erro create_preview', up1.err);
    check('F.5', 'A: 1ª fatura segue paga em 750 (nada reembolsado/recobrado)', 750, s.paid);
    const row = await subRow(A.checkoutId); check('F.6', 'A: banco price=15 pending=false', [15, false], [Number(row?.price), row?.promo_first_cycle_pending]);
  }
  if (B.row?.gateway_subscription_id) { const s = await stSub(B.row.gateway_subscription_id); check('F.7', 'B: Stripe item agora 27840 usd year', 27840, s.unit); }

  // ---- G: troca nativa PRO -> Premium com promo pendente
  { const u = await newUser('G'); const r = await buy(u, 'Produtor PRO');
    if (r.row?.gateway_subscription_id) {
      const s0 = await stSub(r.row.gateway_subscription_id); await webhook(s0.invoice, 'subscription_create', 'activate'); await sleep(700);
      await sleep(16000);
      const sw = await buy(u, 'Premium'); check('G.1', 'troca nativa Stripe: HTTP 200', 200, sw.res.status);
      const rows = (await sb(`subscriptions?user_id=eq.${u.id}&select=id,plan,status,price,currency,promo_first_cycle_pending,promo_full_price,gateway_subscription_id&order=created_at.asc`)).json || [];
      note('G.2', 'linhas do usuário após a troca', rows.map(x => `${x.plan}/${x.status}/${x.price}${x.currency}/pend=${x.promo_first_cycle_pending}/full=${x.promo_full_price}`));
      const active = rows.find(x => x.status === 'active');
      check('G.3', 'assinatura ativa pós-troca: Premium 29 USD cheio, sem promo', ['Premium', 29, false, null], [active?.plan, Number(active?.price), active?.promo_first_cycle_pending, active?.promo_full_price]);
      check('G.4', 'nenhuma linha ficou com promo pendente (evita reajustar plano errado)', 0, rows.filter(x => x.promo_first_cycle_pending).length);
      const s1 = await stSub(r.row.gateway_subscription_id); check('G.5', 'Stripe: mesma assinatura agora no item de 2900 usd', 2900, s1.unit);
    } }

  // ---- H: abuso — cancelar e reassinar (Stripe)
  { const c = await app('/api/subscriptions/cancel', { method: 'POST', token: uA.token, body: {} }); check('H.1', 'cancelamento: HTTP 200', 200, c.status);
    if (A.row?.gateway_subscription_id) { const s = await stSub(A.row.gateway_subscription_id); check('H.2', 'Stripe: assinatura cancelada', 'canceled', s.status); }
    await sleep(16000); const again = await buy(uA, 'Produtor PRO');
    note('H.3', 'REASSINATURA após cancelar (Stripe)', { http: again.res.status, price: again.row?.price, pending: again.row?.promo_first_cycle_pending });
    check('H.4', 'promo não deveria se repetir (esperado 15 cheio)', 15, Number(again.row?.price)); }
} catch (e) { console.log('ERRO FATAL:', e.message); R.push({ id: 'FATAL', desc: e.message, pass: false }); }
finally {
  console.log('\n== LIMPEZA ==');
  try { await sb('platform_settings?key=eq.promo_primeiro_ciclo_ativo', { method: 'PATCH', body: { value: T.flag ?? '1' } }); } catch {}
  for (const [id, v] of Object.entries(T.planSnap)) { try { await sb(`plans?id=eq.${id}`, { method: 'PATCH', body: v }); } catch {} }
  for (const s of T.stSubs) { try { await st(`/subscriptions/${s}`, { method: 'DELETE' }); } catch {} }
  const delCust = []; for (const c of T.stCust) { try { const r = await st(`/customers/${c}`, { method: 'DELETE' }); delCust.push(r.json?.deleted === true); } catch {} }
  for (const id of T.coupons) { try { await sb(`coupons?id=eq.${id}`, { method: 'DELETE' }); } catch {} }
  for (const uid of T.users) { try { await sb(`subscriptions?user_id=eq.${uid}`, { method: 'DELETE' }); } catch {} }
  for (const uid of T.users) { try { await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SVC, authorization: `Bearer ${SVC}` } }); } catch {} }
  await sleep(1500);
  let subsLeft = 0; for (const s of T.stSubs) { const r = await st(`/subscriptions/${s}`); if (r.json?.status && r.json.status !== 'canceled') subsLeft++; }
  let custLeft = 0; for (const c of T.stCust) { const r = await st(`/customers/${c}`); if (r.status === 200 && !r.json?.deleted) custLeft++; }
  const usersLeft = (await sb(`profiles?id=in.(${T.users.join(',')})&select=id`)).json?.length; const cpLeft = (await sb(`coupons?code=like.SUITE_${RUN.toUpperCase()}*&select=id`)).json?.length;
  const flagNow = (await sb('platform_settings?key=eq.promo_primeiro_ciclo_ativo&select=value')).json?.[0]?.value; const plansNow = (await sb('plans?select=name,promotional_price,promotional_price_usd&is_active=eq.true')).json;
  const resid = { stripeAssinaturasCriadas: T.stSubs.size, stripeAssinaturasNaoCanceladas: subsLeft, stripeCustomersCriados: T.stCust.size, stripeCustomersNaoApagados: custLeft, usuariosRestantes: usersLeft, cuponsRestantes: cpLeft, flagFinal: flagNow, promoPriceFinal: plansNow.map(p => `${p.name}=${p.promotional_price}/${p.promotional_price_usd}`) };
  console.log('RESÍDUO:', JSON.stringify(resid));
  const pass = R.filter(r => r.pass === true).length, fail = R.filter(r => r.pass === false);
  console.log(`\n== RESUMO: ${pass} PASS | ${fail.length} FAIL | ${R.filter(r => r.pass === null).length} NOTES ==`);
  for (const f of fail) console.log('  FAIL', f.id, f.desc, '| esperado', JSON.stringify(f.exp), '| obtido', JSON.stringify(f.act));
  writeFileSync(process.env.OUT || 'e2e-stripe-results.json', JSON.stringify({ run: RUN, resid, results: R }, null, 1));
}
