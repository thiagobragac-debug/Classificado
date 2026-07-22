const { Router } = require('express');
const { ApiError } = require('../../utils/apiErrors');

// SECURITY FIX (TASK 3): UUID validation for /:id route.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SECURITY FIX (TASK 7): Input sanitization helpers (mirrored from server.js).
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
function parseSafeId(value) {
  if (typeof value !== 'string' || !SAFE_ID_REGEX.test(value)) return null;
  return value;
}

function parseNumericParam(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!isFinite(n) || n < min || n > max) return null;
  return n;
}

// SECURITY FIX (TASK 6): Whitelist for sort fields to prevent sort injection.
const ALLOWED_SORT_FIELDS = new Set(['created_at', 'price', 'views_count', 'expires_at', 'title_pt']);


/**
 * Creates the Anuncios router
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {import('redis').RedisClientType} redisClient 
 * @param {import('meilisearch').MeiliSearch} meiliClient
 * @returns {Router}
 */
module.exports = function createAnunciosRouter(supabase, redisClient, meiliClient) {
  const router = Router();

  /**
   * @route GET /api/v1/anuncios
   * @description List ads with filters
   */
  router.get('/', async (req, res, next) => {
    try {
      const {
        category_id, country, state, city, price_min, price_max,
        status = 'active', featured, search, sort = 'created_at',
        order = 'desc', page = '1', per_page = '20', lang = 'pt'
      } = req.query;

      // SECURITY FIX (TASK 7): Validate search length.
      if (search && search.length > 500) {
        return res.status(400).json({ error: 'Parâmetro search muito longo' });
      }

      // SECURITY FIX (TASK 6): Sanitize sort and order against whitelists.
      const sortField = ALLOWED_SORT_FIELDS.has(sort) ? sort : 'created_at';
      const orderDir = order === 'asc' ? 'asc' : 'desc';

      // SECURITY FIX (TASK 7): Sanitize filter fields.
      const safeCategoryId = category_id ? parseSafeId(category_id) : null;
      const safeCountry    = country ? parseSafeId(country) : null;
      const safeState      = state ? parseSafeId(state) : null;
      const safeCity       = city ? parseSafeId(city) : null;
      const safeStatus     = status ? parseSafeId(status) : null;
      const safePriceMin   = price_min != null ? parseNumericParam(price_min, 0) : null;
      const safePriceMax   = price_max != null ? parseNumericParam(price_max, 0) : null;

      if (category_id && !safeCategoryId) return res.status(400).json({ error: 'Parâmetro category_id inválido' });
      if (country && !safeCountry) return res.status(400).json({ error: 'Parâmetro country inválido' });
      if (state && !safeState) return res.status(400).json({ error: 'Parâmetro state inválido' });
      if (city && !safeCity) return res.status(400).json({ error: 'Parâmetro city inválido' });
      if (status && !safeStatus) return res.status(400).json({ error: 'Parâmetro status inválido' });
      if (price_min != null && safePriceMin === null) return res.status(400).json({ error: 'Parâmetro price_min inválido' });
      if (price_max != null && safePriceMax === null) return res.status(400).json({ error: 'Parâmetro price_max inválido' });

      const pageNum = Math.max(1, parseInt(page) || 1);
      const perPageNum = Math.min(50, Math.max(1, parseInt(per_page) || 20)); // max 50
      
      // Try Meilisearch if text search is provided
      if (search && meiliClient) {
        const filters = [];
        if (safeCategoryId) filters.push(`category_id = '${safeCategoryId}'`);
        if (safeCountry) filters.push(`country = '${safeCountry}'`);
        if (safeState) filters.push(`state = '${safeState}'`);
        if (safeCity) filters.push(`city = '${safeCity}'`);
        if (featured === 'true') filters.push(`featured = true`);
        if (safeStatus) filters.push(`status = '${safeStatus}'`);
        if (safePriceMin !== null) filters.push(`price >= ${safePriceMin}`);
        if (safePriceMax !== null) filters.push(`price <= ${safePriceMax}`);

        const result = await meiliClient.index('ads').search(search, {
          filter: filters,
          limit: perPageNum,
          offset: (pageNum - 1) * perPageNum,
          sort: sortField !== 'created_at' ? [`${sortField}:${orderDir}`] : undefined
        });

        const formattedMeili = result.hits.map(ad => ({
          id: ad.id,
          title: lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt,
          description: ad.description,
          price: ad.price,
          currency: ad.currency,
          price_unit: lang === 'es' && ad.price_unit_es ? ad.price_unit_es : ad.price_unit_pt,
          location: ad.location_text,
          image: ad.images && ad.images.length > 0 ? ad.images[0] : null,
          category_id: ad.category_id,
          created_at: ad.created_at,
          status: ad.status,
          featured: ad.featured,
          views_count: ad.views_count
        }));

        return res.json({
          success: true,
          data: formattedMeili,
          pagination: {
            page: pageNum,
            per_page: perPageNum,
            total: result.estimatedTotalHits,
            total_pages: Math.ceil(result.estimatedTotalHits / perPageNum)
          }
        });
      }

      // If no search or Meilisearch fails, use Supabase
      // SECURITY FIX (TASK 8): Cache key includes auth status to prevent leaking
      // authenticated-only data to anonymous users.
      const isAuthenticated = !!req.headers.authorization;
      const cacheKey = `v1:ads:${isAuthenticated ? 'auth' : 'anon'}:${Buffer.from(JSON.stringify(req.query)).toString('base64')}`;

      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      let query = supabase.from('ads')
        .select(`
          id, category_id, title_pt, title_es, description, price, currency,
          price_unit_pt, price_unit_es, negotiable, country, state, city,
          location_text, images, tags_pt, status, featured, views_count,
          expires_at, created_at, updated_at,
          categories(name_pt, name_es, icon),
          profiles(display_name, avatar_url)
        `, { count: 'exact' });

      function escapeLike(v) {
        return v.replace(/%/g, '\\%').replace(/_/g, '\\_');
      }

      if (safeCategoryId) query = query.eq('category_id', safeCategoryId);
      if (safeCountry) query = query.ilike('country', `%${escapeLike(safeCountry)}%`);
      if (safeState) query = query.ilike('state', `%${escapeLike(safeState)}%`);
      if (safeCity) query = query.ilike('city', `%${escapeLike(safeCity)}%`);
      if (safeStatus) query = query.eq('status', safeStatus);
      if (featured === 'true') query = query.eq('featured', true);
      if (safePriceMin !== null) query = query.gte('price', safePriceMin);
      if (safePriceMax !== null) query = query.lte('price', safePriceMax);
      
      // SECURITY FIX (TASK 6): Use whitelisted sortField and orderDir.
      query = query.order(sortField, { ascending: orderDir === 'asc' });
      
      const from = (pageNum - 1) * perPageNum;
      const to = from + perPageNum - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Error fetching ads from database');
      }

      const formattedData = data.map(ad => ({
        id: ad.id,
        title: lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt,
        description: ad.description,
        price: ad.price,
        currency: ad.currency,
        price_unit: lang === 'es' && ad.price_unit_es ? ad.price_unit_es : ad.price_unit_pt,
        negotiable: ad.negotiable,
        location: ad.location_text,
        country: ad.country,
        state: ad.state,
        city: ad.city,
        images: ad.images,
        tags: ad.tags_pt,
        status: ad.status,
        featured: ad.featured,
        views_count: ad.views_count,
        created_at: ad.created_at,
        expires_at: ad.expires_at,
        category: ad.categories ? {
          name: lang === 'es' && ad.categories.name_es ? ad.categories.name_es : ad.categories.name_pt,
          icon: ad.categories.icon
        } : null,
        seller: ad.profiles ? {
          name: ad.profiles.display_name,
          avatar: ad.profiles.avatar_url
        } : null
      }));

      const response = {
        success: true,
        data: formattedData,
        pagination: {
          page: pageNum,
          per_page: perPageNum,
          total: count,
          total_pages: Math.ceil(count / perPageNum)
        }
      };

      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 120, JSON.stringify(response)); // 2 min cache
      }

      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @route GET /api/v1/anuncios/:id
   * @description Ad details
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'ID inválido' });
      const lang = req.query.lang || 'pt';
      
      const cacheKey = `v1:ad:${id}:${lang}`;
      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          // Fire and forget view count increment
          supabase.rpc('increment_ad_view', { ad_id: id }).catch(e => console.error(e));
          return res.json(JSON.parse(cached));
        }
      }

      const { data: ad, error } = await supabase.from('ads')
        .select(`
          id, title_pt, title_es, description, price, currency,
          price_unit_pt, price_unit_es, negotiable, country, state, city,
          location_text, images, tags_pt, status, featured, views_count,
          expires_at, created_at, updated_at, category_id,
          categories(name_pt, name_es, icon),
          profiles(display_name, avatar_url, country, verified)
        `)
        .eq('id', id)
        .single();

      if (error || !ad) {
        throw new ApiError(404, 'NOT_FOUND', 'Anúncio não encontrado');
      }

      const formattedData = {
        id: ad.id,
        title: lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt,
        description: ad.description,
        price: ad.price,
        currency: ad.currency,
        price_unit: lang === 'es' && ad.price_unit_es ? ad.price_unit_es : ad.price_unit_pt,
        negotiable: ad.negotiable,
        location: ad.location_text,
        country: ad.country,
        state: ad.state,
        city: ad.city,
        images: ad.images,
        tags: ad.tags_pt,
        status: ad.status,
        featured: ad.featured,
        views_count: ad.views_count,
        created_at: ad.created_at,
        updated_at: ad.updated_at,
        expires_at: ad.expires_at,
        category: ad.categories ? {
          id: ad.category_id,
          name: lang === 'es' && ad.categories.name_es ? ad.categories.name_es : ad.categories.name_pt,
          icon: ad.categories.icon
        } : null,
        seller: ad.profiles ? {
          name: ad.profiles.display_name,
          avatar: ad.profiles.avatar_url,
          verified: ad.profiles.verified
        } : null
      };

      const response = {
        success: true,
        data: formattedData
      };

      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(response)); // 5 min cache
      }

      // Increment view count
      supabase.rpc('increment_ad_view', { ad_id: id }).catch(e => console.error(e));

      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
