const { Router } = require('express');
const { ApiError } = require('../../utils/apiErrors');

/**
 * Validates and parses a numeric route/query parameter.
 * Returns null if the value is not a safe integer within [min, 2147483647].
 *
 * @param {string|any} value
 * @param {number} [min=1]
 * @returns {number|null}
 */
function parseNumericParam(value, min = 1) {
  const n = parseInt(value, 10);
  if (!isFinite(n) || n < min || n > 2147483647) return null;
  return n;
}

/**
 * Creates the Localizacoes router
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {import('redis').RedisClientType} redisClient 
 * @returns {Router}
 */
module.exports = function createLocalizacoesRouter(supabase, redisClient) {
  const router = Router();

  const getWithCache = async (cacheKey, queryFn, res, next) => {
    try {
      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
      }

      const { data, error } = await queryFn();
      
      if (error) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Error fetching data from database');
      }

      const response = { success: true, data };

      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 86400, JSON.stringify(response)); // 24h
      }

      res.json(response);
    } catch (err) {
      next(err);
    }
  };

  /**
   * @route GET /api/v1/paises
   * @description List all countries
   */
  router.get('/paises', (req, res, next) => {
    getWithCache(
      'v1:paises',
      () => supabase.from('paises').select('id, nome, sigla').order('nome'),
      res, next
    );
  });

  /**
   * @route GET /api/v1/estados/:pais_id
   * @description List states for a country
   */
  router.get('/estados/:pais_id', (req, res, next) => {
    const pais_id = parseNumericParam(req.params.pais_id);
    if (!pais_id) return res.status(400).json({ error: 'pais_id inválido' });
    getWithCache(
      `v1:estados:${pais_id}`,
      () => supabase.from('estados').select('id, nome, sigla').eq('pais_id', pais_id).order('nome'),
      res, next
    );
  });

  /**
   * @route GET /api/v1/cidades/:estado_id
   * @description List cities for a state
   */
  router.get('/cidades/:estado_id', (req, res, next) => {
    const estado_id = parseNumericParam(req.params.estado_id);
    if (!estado_id) return res.status(400).json({ error: 'estado_id inválido' });
    getWithCache(
      `v1:cidades:${estado_id}`,
      () => supabase.from('cidades').select('id, nome').eq('estado_id', estado_id).order('nome'),
      res, next
    );
  });

  return router;
};
