/**
 * @file apiKeyAuth.js
 * @description Express middleware for API key authentication.
 * Validates keys via Redis cache → Supabase `api_keys` table fallback.
 */

'use strict';

const { ApiError, sendError, UNAUTHORIZED } = require('../utils/apiErrors');
const crypto = require('crypto');

/** Redis cache TTL for validated API keys (seconds) */
const CACHE_TTL = 300; // 5 minutes

/**
 * Create the API key authentication middleware.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {import('redis').RedisClientType} redisClient - Redis client
 * @returns {import('express').RequestHandler}
 */
function createApiKeyAuth(supabase, redisClient) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return async function apiKeyAuth(req, res, next) {
    // 1. Extract API key from header or query param
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return sendError(res, UNAUTHORIZED);
    }

    // Compute SHA-256 hash of the incoming key for safe lookup
    const inputHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    try {
      // 2. Try Redis cache first (keyed by hash, not plaintext)
      const cacheKey = `apikey:${inputHash}`;
      let partner = null;



      if (redisClient && redisClient.isReady) {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            partner = JSON.parse(cached);
            // Verificar se a chave expirou após o cache ser preenchido
            if (partner.expires_at && new Date(partner.expires_at) < new Date()) {
              await redisClient.del(cacheKey);
              partner = null; // força re-busca no banco
            }
          }
        } catch (redisErr) {
          // Redis read failure – fall through to Supabase
          console.warn('[apiKeyAuth] Redis read error:', redisErr.message);
        }
      }

      // 3. If not in cache, query Supabase
      if (!partner) {
        // 3. Query Supabase by key_hash (SHA-256 lookup — no plaintext exposure)
        const { data, error } = await supabase
          .from('api_keys')
          .select('*')
          .eq('key_hash', inputHash)
          .eq('is_active', true)
          .single();

        if (error || !data) {
          return sendError(
            res,
            new ApiError(401, 'UNAUTHORIZED', 'Invalid or inactive API key.')
          );
        }

        // 4. Check expiration
        if (data.expires_at) {
          const expiresAt = new Date(data.expires_at);
          if (expiresAt <= new Date()) {
            return sendError(
              res,
              new ApiError(401, 'UNAUTHORIZED', 'API key has expired. Please request a new key.')
            );
          }
        }

        partner = {
          id: data.id,
          partner_name: data.partner_name,
          permissions: data.permissions,
          rate_limit: data.rate_limit,
          environment: data.environment,
          expires_at: data.expires_at
        };

        // 5. Cache result in Redis
        if (redisClient && redisClient.isReady) {
          try {
            await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(partner));
          } catch (cacheErr) {
            console.warn('[apiKeyAuth] Redis write error:', cacheErr.message);
          }
        }
      }

      // 6. Attach partner info to request
      req.apiPartner = partner;

      // 7. Fire-and-forget: update last_used_at
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', partner.id)
        .then(() => {})
        .catch((err) => {
          console.warn('[apiKeyAuth] Failed to update last_used_at:', err.message);
        });

      next();
    } catch (err) {
      console.error('[apiKeyAuth] Unexpected error:', err);
      return sendError(
        res,
        new ApiError(401, 'UNAUTHORIZED', 'API key validation failed.')
      );
    }
  };
}

module.exports = createApiKeyAuth;
