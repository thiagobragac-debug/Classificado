require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { createClient: createRedisClient } = require('redis');
const { Meilisearch } = require('meilisearch');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Redis
const redisClient = createRedisClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Initialize Meilisearch
const meiliClient = new Meilisearch({
  host: process.env.MEILI_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY || 'TauzeClassMeiliMasterKey2026'
});

// Middleware for Redis Cache
const cacheMiddleware = (keyPrefix, expiration = 3600) => async (req, res, next) => {
  if (!redisClient.isReady) {
    console.warn('Redis not ready, skipping cache');
    return next();
  }
  const key = `${keyPrefix}:${req.originalUrl}`;
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redisClient.setEx(key, expiration, JSON.stringify(body));
      return originalJson(body);
    };
    next();
  } catch (err) {
    next();
  }
};

// Start Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis');
  } catch(e) {
    console.error('❌ Failed to connect to Redis', e.message);
  }
})();

// --- ROUTES ---

// 1. Geography with Redis Cache
app.get('/api/countries', cacheMiddleware('geo'), async (req, res) => {
  const { data, error } = await supabase.from('paises').select('*').order('nome');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.get('/api/states/:countryId', cacheMiddleware('geo'), async (req, res) => {
  const { data, error } = await supabase.from('estados').select('*').eq('pais_id', req.params.countryId).order('nome');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.get('/api/cities/:stateId', cacheMiddleware('geo'), async (req, res) => {
  const { data, error } = await supabase.from('cidades').select('*').eq('estado_id', req.params.stateId).order('nome');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// 2. Categories with Redis Cache
app.get('/api/categories', cacheMiddleware('cats', 86400), async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// 3. Search Ads via Meilisearch
app.get('/api/search', async (req, res) => {
  const { q, category, limit = 20, page = 1, featured, preco_min, preco_max } = req.query;
  try {
    const filters = [];
    if (category) filters.push(`category_id = '${category}'`);
    if (req.query.country) filters.push(`country = '${req.query.country}'`);
    if (featured === 'true') filters.push(`featured = true`);
    if (preco_min) filters.push(`price >= ${preco_min}`);
    if (preco_max) filters.push(`price <= ${preco_max}`);

    const result = await meiliClient.index('ads').search(q || '', {
      filter: filters,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Banners with Redis Cache
app.get('/api/banners', cacheMiddleware('banners', 3600), async (req, res) => {
  const { position } = req.query;
  let q = supabase.from('banners').select('*').eq('status', 'active');
  if (position) q = q.eq('position', position);
  
  const { data, error } = await q;
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// 5. Auctions with Redis Cache (short expiration due to bids)
app.get('/api/auctions', cacheMiddleware('auctions', 60), async (req, res) => {
  const { status = 'active' } = req.query;
  const { data, error } = await supabase
    .from('auctions')
    .select('*, ads(*, categories(name_pt))')
    .eq('status', status)
    .order('start_date', { ascending: true });
    
  if (error) return res.status(500).json({ error });
  res.json(data);
});

const paymentService = require('./services/paymentService');

// 6. Checkout MercadoPago (One-Time for highlights)
app.post('/api/checkout', async (req, res) => {
  const { adId, planType, userId } = req.body;
  if (!adId || !planType || !userId) return res.status(400).json({ error: 'Dados incompletos' });

  // Define prices
  const prices = { 'ouro': 49.90, 'diamante': 89.90 };
  const amount = prices[planType];
  if (!amount) return res.status(400).json({ error: 'Plano inválido' });

  try {
    // 1. Create transaction in DB
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ user_id: userId, ad_id: adId, plan_type: planType, amount, status: 'pending' })
      .select().single();

    if (txErr) throw txErr;

    // 2. Create Payment via Service
    const result = await paymentService.createOneTimePayment({
      title: `Destaque ${planType.charAt(0).toUpperCase() + planType.slice(1)} - Tauze Class`,
      amount: amount,
      externalReference: tx.id,
      successUrl: 'http://localhost:8080/painel.html?status=success',
      failureUrl: 'http://localhost:8080/painel.html?status=failure',
      pendingUrl: 'http://localhost:8080/painel.html?status=pending'
    });

    res.json({ init_point: result.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6.1. Checkout de Assinatura (Subscription)
app.post('/api/checkout/subscription', async (req, res) => {
  const { planId, userId, userEmail } = req.body;
  if (!planId || !userId) return res.status(400).json({ error: 'Dados incompletos' });

  try {
    // Fetch plan details from Supabase
    const { data: plan, error: planErr } = await supabase.from('plans').select('*').eq('id', planId).single();
    if (planErr || !plan) throw new Error('Plano não encontrado');

    if (plan.price <= 0) {
      // It's a free plan downgrade
      await supabase.from('profiles').update({ plan_id: plan.id, subscription_status: 'active' }).eq('id', userId);
      return res.json({ redirectUrl: '/painel.html#assinatura', free: true });
    }

    // Create transaction in DB (type: subscription)
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ user_id: userId, plan_type: 'subscription', amount: plan.price, status: 'pending' })
      .select().single();

    if (txErr) throw txErr;

    // Create Subscription Payment via Service
    const result = await paymentService.createSubscription({
      planName: plan.name,
      amount: plan.price,
      userEmail: userEmail,
      externalReference: tx.id,
      successUrl: 'http://localhost:8080/painel.html?status=success_sub',
      failureUrl: 'http://localhost:8080/painel.html?status=failure_sub'
    });

    // Save planId in the transaction metadata/notes so webhook knows what plan to apply
    await supabase.from('transactions').update({ notes: planId }).eq('id', tx.id);

    res.json({ init_point: result.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Webhook MercadoPago / Pagamentos
app.post('/api/webhook/payment', async (req, res) => {
  const { type, data } = req.body;
  
  if (type === 'payment' && data && data.id) {
    try {
      const txId = req.body.external_reference || req.query.external_reference;
      
      if (txId) {
        await supabase.from('transactions').update({ status: 'approved', payment_id: data.id }).eq('id', txId);
        
        const { data: tx } = await supabase.from('transactions').select('ad_id, plan_type, user_id, notes').eq('id', txId).single();
        if (tx) {
          if (tx.plan_type === 'subscription' && tx.notes) {
            // Apply subscription to user
            await supabase.from('profiles').update({ plan_id: tx.notes, subscription_status: 'active' }).eq('id', tx.user_id);
          } else if (tx.ad_id) {
            // Update ad to featured
            await supabase.from('ads').update({ featured: true }).eq('id', tx.ad_id);
            await meiliClient.index('ads').updateDocuments([{ id: tx.ad_id, featured: true }]);
          }
        }
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }
  }
  res.sendStatus(200);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tauze Class API is running on port ${PORT}`);
});
