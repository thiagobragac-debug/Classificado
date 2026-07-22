const { Router } = require('express');
const { sendSuccess, sendError, ApiError } = require('../../utils/apiErrors');

/**
 * Creates the Categorias router
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {import('redis').RedisClientType} redisClient 
 * @returns {Router}
 */
module.exports = function createCategoriasRouter(supabase, redisClient) {
  const router = Router();

  /**
   * @route GET /api/v1/categorias
   * @description List all active categories with ad counts
   */
  router.get('/', async (req, res, next) => {
    try {
      const lang = req.query.lang === 'es' ? 'es' : 'pt';
      const cacheKey = `v1:categorias:${lang}`;
      
      // Try cache first
      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      // Fetch categories
      const { data: categories, error } = await supabase
        .from('categories')
        .select('id, name_pt, name_es, icon, sort_order')
        .eq('active', true)
        .order('sort_order');
        
      if (error) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Error fetching categories from database');
      }

      // Format response based on language
      const formattedData = categories.map(cat => ({
        id: cat.id,
        name: lang === 'es' ? cat.name_es : cat.name_pt,
        icon: cat.icon,
        sort_order: cat.sort_order
      }));

      const response = {
        success: true,
        data: formattedData
      };

      // Set cache
      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 86400, JSON.stringify(response)); // 24h cache
      }

      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
