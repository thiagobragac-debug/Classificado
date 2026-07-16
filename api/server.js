require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createClient: createRedisClient } = require('redis');
const { Meilisearch } = require('meilisearch');

// ?? Security & API v1 Imports ??????????????????????????????????????????????
const securityHeaders    = require('./middleware/securityHeaders');
const createApiKeyAuth   = require('./middleware/apiKeyAuth');
const createRateLimiter  = require('./middleware/rateLimiter');
const createRequestLogger = require('./middleware/requestLogger');
const { verifyAnyGateway } = require('./middleware/webhookVerifier');
const { errorHandler, ApiError } = require('./utils/apiErrors');

const createAnunciosRouter    = require('./routes/v1/anuncios');
const createCategoriasRouter  = require('./routes/v1/categorias');
const createLocalizacoesRouter = require('./routes/v1/localizacoes');

const app = express();

// ?? Security headers (must be first) ??????????????????????????????????????
app.use(securityHeaders());

// ?? CORS whitelist ?????????????????????????????????????????????????????????
// SECURITY FIX (TASK 3): Localhost origins are only allowed in development.
const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = [
  ...(isDev ? [
    'http://localhost',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://127.0.0.1:8080',
  ] : []),
  ...(process.env.FRONTEND_URL || '').split(',').map(o => o.trim()).filter(Boolean),
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// ?? Body parsers ???????????????????????????????????????????????????????????
// Raw body must be captured BEFORE express.json() for webhook signature verification.
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ?? Supabase ???????????????????????????????????????????????????????????????
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('? SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ?? Redis ??????????????????????????????????????????????????????????????????
if (!process.env.REDIS_URL) {
  console.error('[FATAL] REDIS_URL n�o definido. Configure a vari�vel de ambiente.');
  process.exit(1);
}
const redisClient = createRedisClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// ?? Meilisearch ????????????????????????????????????????????????????????????
// SECURITY: No hardcoded fallback. The Meili Master Key MUST be set via env.
if (!process.env.MEILI_MASTER_KEY) {
  console.error('? MEILI_MASTER_KEY must be set in .env');
  process.exit(1);
}

const meiliClient = new Meilisearch({
  host: process.env.MEILI_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
});

// ?? Redis cache middleware ?????????????????????????????????????????????????
const cacheMiddleware = (keyPrefix, expiration = 3600) => async (req, res, next) => {
  if (!redisClient.isReady) {
    return next();
  }
  const key = `${keyPrefix}:${req.originalUrl}`;
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redisClient.setEx(key, expiration, JSON.stringify(body));
      return originalJson(body);
    };
    next();
  } catch {
    next();
  }
};

// ?? Start Redis ????????????????????????????????????????????????????????????
(async () => {
  try {
    await redisClient.connect();
    console.log('? Connected to Redis');
  } catch (e) {
    console.error('? Failed to connect to Redis:', e.message);
  }
})();

// ?? Validation helpers ?????????????????????????????????????????????????????
/** Validates that a value is a finite number within an optional range. */
function parseNumericParam(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Validates that a string only contains safe alphanumeric/hyphen/underscore chars. */
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
function parseSafeId(value) {
  if (typeof value !== 'string' || !SAFE_ID_REGEX.test(value)) return null;
  return value;
}

// ?????????????????????????????????????????????????????????????????????????????
// ROUTES
// ?????????????????????????????????????????????????????????????????????????????

// 1. Geography (with Redis cache)
app.get('/api/countries', cacheMiddleware('geo'), async (req, res) => {
  const { data, error } = await supabase.from('paises').select('*').order('nome');
  if (error) return res.status(500).json({ error: 'Erro interno ao buscar pa�ses' });
  res.json(data);
});

app.get('/api/states/:countryId', cacheMiddleware('geo'), async (req, res) => {
  const countryId = parseNumericParam(req.params.countryId, 1);
  if (!countryId) return res.status(400).json({ error: 'countryId inv�lido' });
  const { data, error } = await supabase.from('estados').select('*').eq('pais_id', countryId).order('nome');
  if (error) return res.status(500).json({ error: 'Erro interno ao buscar estados' });
  res.json(data);
});

app.get('/api/cities/:stateId', cacheMiddleware('geo'), async (req, res) => {
  const stateId = parseNumericParam(req.params.stateId, 1);
  if (!stateId) return res.status(400).json({ error: 'stateId inv�lido' });
  const { data, error } = await supabase.from('cidades').select('*').eq('estado_id', stateId).order('nome');
  if (error) return res.status(500).json({ error: 'Erro interno ao buscar cidades' });
  res.json(data);
});

// 2. Categories (with Redis cache)
app.get('/api/categories', cacheMiddleware('cats', 86400), async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
  if (error) return res.status(500).json({ error: 'Erro interno ao buscar categorias' });
  res.json(data);
});

// 3. Search via Meilisearch
// SECURITY FIX (VULN-002): All user-supplied filter parameters are strictly
// validated before being passed to Meilisearch. No raw string interpolation.
app.get('/api/search', async (req, res) => {
  const { q, limit = 20, page = 1, featured } = req.query;

  // Validate string identity params (safe alphanumeric only)
  const category = parseSafeId(req.query.category);
  const country  = parseSafeId(req.query.country);

  // Validate numeric params (must be real numbers, non-negative)
  const preco_min = req.query.preco_min != null ? parseNumericParam(req.query.preco_min, 0) : null;
  const preco_max = req.query.preco_max != null ? parseNumericParam(req.query.preco_max, 0) : null;

  if (req.query.category && !category) {
    return res.status(400).json({ error: 'Par�metro category inv�lido' });
  }
  if (req.query.country && !country) {
    return res.status(400).json({ error: 'Par�metro country inv�lido' });
  }
  if (req.query.preco_min != null && preco_min === null) {
    return res.status(400).json({ error: 'Par�metro preco_min inv�lido' });
  }
  if (req.query.preco_max != null && preco_max === null) {
    return res.status(400).json({ error: 'Par�metro preco_max inv�lido' });
  }

  const limitVal = Math.min(Math.max(parseNumericParam(limit, 1, 100) || 20, 1), 100);
  const pageVal  = Math.max(parseNumericParam(page, 1) || 1, 1);

  try {
    // Build filter array with validated values only
    const filters = [];
    if (category)            filters.push(`category_id = '${category}'`);
    if (country)             filters.push(`country = '${country}'`);
    if (featured === 'true') filters.push('featured = true');
    if (preco_min !== null)  filters.push(`price >= ${preco_min}`);
    if (preco_max !== null)  filters.push(`price <= ${preco_max}`);

    const result = await meiliClient.index('ads').search(q || '', {
      filter: filters,
      limit: limitVal,
      offset: (pageVal - 1) * limitVal,
    });
    res.json(result);
  } catch (err) {
    console.error('[search] Meilisearch error:', err.message);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
});

// 4. Banners (with Redis cache)
app.get('/api/banners', cacheMiddleware('banners', 3600), async (req, res) => {
  const position = parseSafeId(req.query.position);
  let q = supabase.from('banners').select('*').eq('status', 'active');
  if (position) q = q.eq('position', position);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: 'Erro ao buscar banners' });
  res.json(data);
});

// 5. Auctions (with Redis cache, short TTL due to live bids)
app.get('/api/auctions', cacheMiddleware('auctions', 60), async (req, res) => {
  const status = parseSafeId(req.query.status) || 'active';
  const { data, error } = await supabase
    .from('auctions')
    .select('*, ads(*, categories(name_pt))')
    .eq('status', status)
    .order('start_date', { ascending: true });
  if (error) return res.status(500).json({ error: 'Erro ao buscar leil�es' });
  res.json(data);
});

// ?? Payment service ????????????????????????????????????????????????????????
const paymentService = require('./services/paymentService');

/** Shared helper: create Supabase client authenticated with the request's Bearer token. */
function getAuthenticatedClient(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
  return null; // No token provided
}

// 6. Checkout � one-time highlight payment
// SECURITY FIX (TASK 1): userId is always extracted from JWT, never from request body.
// SECURITY FIX (TASK 3): Rate limit applied.
const checkoutLimiter = (req, res, next) => {
  if (!redisClient.isReady) return next();
  const ip = req.ip || req.connection.remoteAddress;
  const key = `ratelimit:checkout:${ip}`;
  redisClient.incr(key).then(count => {
    if (count === 1) redisClient.expire(key, 60);
    if (count > 10) return res.status(429).json({ error: 'Muitas tentativas de pagamento. Tente novamente em 1 minuto.' });
    next();
  }).catch(() => next());
};

const { z } = require('zod');

const checkoutSchema = z.object({
  adId: z.string().uuid({ message: 'adId deve ser um UUID v�lido' }),
  planType: z.enum(['ouro', 'diamante'], { message: 'Plano inv�lido' }),
});

app.post('/api/checkout', checkoutLimiter, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { adId, planType } = parsed.data;

  const prices = { ouro: 49.90, diamante: 89.90 };
  const amount = prices[planType];

  const supabaseAuth = getAuthenticatedClient(req);
  if (!supabaseAuth) return res.status(401).json({ error: 'Token de autentica��o necess�rio' });

  try {
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token inv�lido' });
    const userId = user.id; // Always from JWT � never from body!

    const { data: tx, error: txErr } = await supabaseAuth
      .from('transactions')
      .insert({ user_id: userId, ad_id: adId, plan_type: planType, amount, status: 'pending' })
      .select()
      .single();

    if (txErr) throw txErr;

    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:8080';

    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    const settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
    const gateway  = process.env.PAYMENT_GATEWAY || settings.payment_gateway || 'mercadopago';

    const result = await paymentService.createTransparentIntent({
      gateway,
      settings,
      planName: `Destaque ${planType.charAt(0).toUpperCase() + planType.slice(1)} - Tauze Class`,
      amount,
      userEmail: user.email,
      externalReference: tx.id
    });

    res.json({ init_point: result.preferenceId || result.clientSecret || result.publicKey || null, gateway, txId: tx.id });
  } catch (err) {
    console.error('[checkout] Error:', err.message);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

// 6.1. Checkout � subscription intent
// SECURITY FIX (TASK 1): userId is always extracted from JWT, never from request body.
const subscriptionIntentSchema = z.object({
  planId: z.string().min(1, { message: 'planId � obrigat�rio' }),
  userEmail: z.string().email({ message: 'Email inv�lido' }).optional(),
});

app.post('/api/checkout/subscription/intent', checkoutLimiter, async (req, res) => {
  const parsed = subscriptionIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { planId, userEmail } = parsed.data;

  const supabaseAuth = getAuthenticatedClient(req);
  if (!supabaseAuth) return res.status(401).json({ error: 'Token de autentica��o necess�rio' });

  try {
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token inv�lido' });
    const userId = user.id; // Always from JWT � never from body!

    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
    if (!plan) throw new Error('Plano n�o encontrado');
    if (plan.price <= 0) return res.json({ free: true });

    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    const settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
    const gateway  = process.env.PAYMENT_GATEWAY || settings.payment_gateway || 'mercadopago';

    const { data: tx, error: txErr } = await supabaseAuth
      .from('transactions')
      .insert({ user_id: userId, plan_type: 'subscription', amount: plan.price, status: 'pending', notes: planId })
      .select()
      .single();
    if (txErr) throw txErr;

    const result = await paymentService.createSubscriptionIntent({ 
      gateway, 
      settings, 
      externalReference: tx.id,
      planName: plan.name_pt || plan.id,
      amount: plan.price,
      payerEmail: userEmail || user.email
    });
    res.json({ gateway, ...result, transactionId: tx.id });
  } catch (err) {
    console.error('[subscription/intent] Error:', err.message);
    res.status(500).json({ error: 'Erro ao criar inten��o de pagamento' });
  }
});

// 6.1.b. Checkout � process subscription
// SECURITY FIX (TASK 1): Verify that the transaction belongs to the authenticated user.
app.post('/api/checkout/subscription/process', checkoutLimiter, async (req, res) => {
  const { transactionId, token, paymentMethodId, issuerId, installments, payer } = req.body;

  const supabaseAuth = getAuthenticatedClient(req);
  if (!supabaseAuth) return res.status(401).json({ error: 'Token de autentica��o necess�rio' });

  try {
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token inv�lido' });

    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    const settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
    const gateway  = process.env.PAYMENT_GATEWAY || settings.payment_gateway || 'mercadopago';

    const { data: tx } = await supabaseAuth.from('transactions').select('*').eq('id', transactionId).single();
    if (!tx) throw new Error('Transa��o n�o encontrada');

    // SECURITY FIX: Ensure the transaction belongs to the authenticated user.
    if (tx.user_id !== user.id) {
      return res.status(403).json({ error: 'Acesso negado: transa��o n�o pertence ao usu�rio autenticado' });
    }
    
    // Idempot�ncia: impede cobran�a dupla se a requisi��o for repetida ap�s j� ter sucesso
    if (tx.status !== 'pending') {
      return res.status(409).json({ error: 'Transa��o j� foi processada' });
    }

    const { data: plan } = await supabase.from('plans').select('*').eq('id', tx.notes).single();
    if (!plan) throw new Error('Plano original n�o encontrado');

    // Captura o IP real do usu�rio (necess�rio para ASAAS � obrigat�rio no payload de cart�o)
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
    if (payer && !payer.remoteIp) payer.remoteIp = clientIp;

    const result = await paymentService.processSubscription({
      gateway, settings, planName: plan.name_pt || plan.name || plan.id, amount: tx.amount,
      tx, token, paymentMethodId, issuerId, installments, payer,
    });

    const APPROVED_STATUSES = ['authorized', 'approved', 'active', 'succeeded', 'paid'];
    const isApproved = APPROVED_STATUSES.includes(result.status);

    await supabaseAuth.from('transactions').update({
      payment_id: result.id,
      status: isApproved ? 'approved' : 'pending',
    }).eq('id', transactionId);

    // NOTE: Plan activation is handled by the webhook (activate_subscription RPC).
    // Only as immediate fallback when gateway confirms synchronously.
    if (isApproved) {
      // Derivar o slug do plano com base no plan.id ou name (mais robusto que s� name)
      const nameL = (plan.name || plan.id || '').toLowerCase();
      const planStr = nameL.includes('premium') ? 'premium'
                    : nameL.includes('pro')     ? 'pro'
                    : 'basic';
      await supabaseAuth.from('profiles')
        .update({ plan_id: plan.id, plan: planStr, subscription_status: 'active' })
        .eq('id', user.id); // use verified user.id, not tx.user_id
    }

    res.json({ status: result.status, id: result.id });
  } catch (err) {
    console.error('[subscription/process] Error:', err.message);
    res.status(500).json({ error: 'Erro ao processar assinatura' });
  }
});

// 6.2. Checkout � transparent intent (multi-gateway)
app.post('/api/checkout/intent', checkoutLimiter, async (req, res) => {
  const { planId, userEmail } = req.body;

  const supabaseAuth = getAuthenticatedClient(req);
  if (!supabaseAuth) return res.status(401).json({ error: 'Token de autentica��o necess�rio' });

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: 'Token inv�lido' });
  const userId = user.id;

  if (!planId) return res.status(400).json({ error: 'Dados incompletos' });

  try {
    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
    if (!plan) throw new Error('Plano n�o encontrado');
    if (plan.price <= 0) return res.json({ free: true });

    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    const settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
    const gateway  = process.env.PAYMENT_GATEWAY || settings.payment_gateway || 'mercadopago';

    // CORRE��O: Criar registro real na tabela transactions antes de chamar o gateway.
    // Sem isso, tx.id seria undefined e o webhook n�o conseguiria identificar o pagamento.
    const { data: tx, error: txErr } = await supabaseAuth
      .from('transactions')
      .insert({ user_id: userId, plan_type: 'subscription', amount: plan.price, status: 'pending', notes: planId })
      .select()
      .single();
    if (txErr) throw txErr;

    const intentData = await paymentService.createTransparentIntent({
      gateway, settings, planName: plan.name_pt || plan.name || plan.id, amount: plan.price,
      userEmail: userEmail || user.email, // CORRE��O: passa email para o MP n�o receber undefined
      externalReference: tx.id,
    });

    res.json({ gateway, ...intentData, txId: tx.id, planId: plan.id });
  } catch (err) {
    console.error('[checkout/intent] Error:', err.message);
    res.status(500).json({ error: 'Erro ao criar inten��o de pagamento' });
  }
});

// 6.3. Checkout � process transparent payment
app.post('/api/checkout/process', checkoutLimiter, async (req, res) => {
  const { planId, token, paymentMethodId, issuerId, installments, payer } = req.body;

  const supabaseAuth = getAuthenticatedClient(req);
  if (!supabaseAuth) return res.status(401).json({ error: 'Token de autentica��o necess�rio' });

  try {
    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    const settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
    const gateway  = process.env.PAYMENT_GATEWAY || settings.payment_gateway || 'mercadopago';

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) throw new Error('Usu�rio n�o autenticado');

    const { data: plan } = await supabaseAuth.from('plans').select('*').eq('id', planId).single();
    if (!plan) throw new Error('Plano inv�lido');

    // CORRE��O: Inserir transa��o no banco ANTES de chamar o gateway.
    // Sem isso, tx.id = undefined e o external_reference enviado ao gateway seria undefined,
    // impossibilitando o webhook de identificar e ativar o pagamento.
    const { data: tx, error: txErr } = await supabaseAuth
      .from('transactions')
      .insert({ user_id: user.id, plan_type: planId, amount: plan.price, status: 'pending', notes: planId })
      .select()
      .single();
    if (txErr) throw txErr;

    const result = await paymentService.processTransparentPayment({
      gateway, settings, tx, token, paymentMethodId, issuerId, installments, payer,
    });

    const APPROVED_STATUSES = ['approved', 'authorized', 'paid', 'succeeded'];
    const isApproved = result.status && APPROVED_STATUSES.includes(result.status);

    await supabaseAuth.from('transactions').update({
      payment_id: result.id,
      status: isApproved ? 'approved' : 'pending'
    }).eq('id', tx.id);

    if (isApproved) {
      await supabaseAuth.from('profiles').update({ plan_id: planId }).eq('id', user.id);
    }

    res.json({ success: true, payment_id: result.id || result.payment_id, status: result.status });
  } catch (err) {
    console.error('[checkout/process] Error:', err.message);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

// ?????????????????????????????????????????????????????????????????????????????
// 7. Webhook � payment notification
// Suporta Stripe, Mercado Pago, Pagar.me e ASAAS via verifyAnyGateway().
// O gateway � detectado automaticamente pelos headers da requisi��o.
// Raw body capturado por express.raw() montado em /api/webhook.
// ?????????????????????????????????????????????????????????????????????????????
app.post('/api/webhook/payment', async (req, res) => {
  const rawBody = req.body; // Buffer, capturado por express.raw()

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Payload inv�lido' });
  }

  // ?? Carrega settings do Supabase (para usar chaves salvas no admin) ????
  let settings = {};
  try {
    const { data: settingsArr } = await supabase.from('platform_settings').select('*');
    settings = Object.fromEntries((settingsArr || []).map(s => [s.key, s.value]));
  } catch (_) { /* usa apenas env vars como fallback */ }

  // ?? Detecta gateway e verifica assinatura HMAC ????????????????????????
  const { valid, gateway, reason } = verifyAnyGateway(rawBody, req.headers, payload, settings);

  if (!valid) {
    console.error(`[webhook/${gateway || 'unknown'}] Verifica��o de assinatura falhou: ${reason}`);
    return res.status(401).json({ error: 'Assinatura inv�lida ou ausente' });
  }

  console.log(`[webhook/${gateway}] Assinatura verificada com sucesso.`);

  // ?? Processa notifica��o de pagamento � roteamento por gateway ????????
  let txId, paymentId;

  if (gateway === 'asaas') {
    // ASAAS envia: { id, event, payment: { id, externalReference, subscription, ... } }
    const { event, payment } = payload;
    if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) && payment) {
      txId      = payment.externalReference; // Nosso tx.id gravado em externalReference
      paymentId = String(payment.id);
    }
  } else {
    // Stripe / Mercado Pago / Pagar.me
    const { type, data } = payload;
    const typeStr = String(type || '');

    // ?? Mercado Pago PreApproval (assinaturas) ?????????????????????????
    // MP envia: { type: 'subscription_preapproval', data: { id: 'PREAPPROVAL_ID' } }
    // O payload N�O cont�m external_reference � � preciso fazer GET na API.
    if (typeStr === 'subscription_preapproval' && data?.id) {
      try {
        const mpToken = settings.mp_access_token || process.env.MP_ACCESS_TOKEN;
        if (mpToken) {
          const axios = require('axios');
          const preapprovalRes = await axios.get(
            `https://api.mercadopago.com/preapproval/${data.id}`,
            { headers: { 'Authorization': `Bearer ${mpToken}` } }
          );
          const pa = preapprovalRes.data;
          if (pa.status === 'authorized' && pa.external_reference) {
            txId      = pa.external_reference;
            paymentId = String(pa.id);
          }
          console.log(`[webhook/mercadopago] PreApproval ${pa.id} status=${pa.status}`);
        }
      } catch (e) {
        console.error('[webhook/mercadopago] Erro ao buscar PreApproval:', e.message);
      }
    }

    // ?? Stripe / MP Pagamentos avulsos / Pagar.me ??????????????????????
    // Stripe:   type = 'payment_intent.succeeded', 'invoice.payment_succeeded', 'customer.subscription.updated'
    // MP:       type = 'payment' (pagamento avulso, n�o PreApproval)
    // Pagar.me: type = 'charge.paid', 'charge.underpaid', etc.
    if (!txId) {
      const dataObject = data?.object || data;
      const resourceId = dataObject?.id;

      const isStripeEvent  = typeStr.startsWith('payment_intent') || typeStr.startsWith('invoice') || typeStr.startsWith('customer.subscription');
      const isMpPayment    = typeStr === 'payment';
      const isPagarmeEvent = typeStr.startsWith('charge');

      if ((isStripeEvent || isMpPayment || isPagarmeEvent) && resourceId) {
        paymentId = String(resourceId);
        
        // Para Stripe invoice.paid, o metadata da subscription fica em subscription_details ou precisamos pegar do webhook
        // Em invoice.paid, a subscription_details nem sempre tem o metadata completo se n�o foi mapeado,
        // mas em subscriptions criadas com metadata, invoice.subscription_details.metadata deve conter.
        // O metadata tamb�m pode estar na raiz da subscription se for `customer.subscription.updated`.
        const stripeMetadata = typeStr.startsWith('invoice') && dataObject.subscription_details?.metadata
                              ? dataObject.subscription_details.metadata
                              : dataObject.metadata;

        txId = stripeMetadata?.external_reference           // Stripe (payment_intents, invoices, subscriptions)
            || payload.external_reference                   // Mercado Pago (pagamentos avulsos)
            || data?.metadata?.external_reference;          // Pagar.me (charges)
      }
    }
  }

  if (txId && paymentId) {
    try {
      // Idempot�ncia � ignora se este payment_id j� foi processado com sucesso
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('payment_id', paymentId)
        .eq('status', 'approved')
        .maybeSingle();

      if (existing) {
        console.log(`[webhook/${gateway}] payment_id ${paymentId} j� processado � ignorando.`);
        return res.sendStatus(200);
      }

      const { data: adId, error: rpcErr } = await supabase.rpc('activate_subscription', {
        p_tx_id: txId,
        p_payment_id: paymentId,
      });

      if (rpcErr) {
        console.error(`[webhook/${gateway}] RPC activate_subscription error:`, rpcErr);
      } else {
        console.log(`[webhook/${gateway}] Assinatura ativada para transa��o ${txId}`);
        if (adId) {
          await meiliClient.index('ads').updateDocuments([{ id: adId, featured: true }]);
        }
      }
    } catch (e) {
      console.error(`[webhook/${gateway}] Erro ao processar:`, e.message);
    }
  }

  res.sendStatus(200);
});

// ?????????????????????????????????????????????????????????????????????????????
// API v1 (REST para Parceiros)
// ?????????????????????????????????????????????????????????????????????????????

const apiKeyAuth    = createApiKeyAuth(supabase, redisClient);
const rateLimiter   = createRateLimiter(redisClient);
const requestLogger = createRequestLogger(supabase);

const v1Router = express.Router();
v1Router.use(requestLogger);
v1Router.use(apiKeyAuth);
v1Router.use(rateLimiter);

v1Router.use('/anuncios',    createAnunciosRouter(supabase, redisClient, meiliClient));
v1Router.use('/categorias',  createCategoriasRouter(supabase, redisClient));
v1Router.use('/localizacoes', createLocalizacoesRouter(supabase, redisClient));

app.use('/api/v1', v1Router);
app.use('/api/v1', errorHandler);

app.use(errorHandler); // cobre /api/checkout*, /api/webhook*, etc.

// ?? Start server ???????????????????????????????????????????????????????????
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? Tauze Class API running on port ${PORT}`);
});
