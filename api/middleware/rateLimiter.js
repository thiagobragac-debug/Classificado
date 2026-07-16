/**
 * @file rateLimiter.js
 * @description Express middleware for per-key rate limiting using a
 * sliding-window counter backed by Redis, with a robust in-memory fallback
 * that prevents the rate limiter from failing open when Redis is unavailable.
 */

'use strict';

const { ApiError, sendError } = require('../utils/apiErrors');

/** Default requests-per-minute when no partner-specific limit is set */
const DEFAULT_RATE_LIMIT = 100;

/** Window size in seconds (1 minute) */
const WINDOW_SECONDS = 60;

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------
// Structure: Map<redisKey, { count: number, resetAt: number }>
// Cleaned up periodically to prevent memory leaks.
const memoryStore = new Map();

/** Prune expired entries from the in-memory store every 2 minutes. */
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 2 * 60 * 1000).unref(); // .unref() ensures the timer doesn't prevent process exit

/**
 * In-memory rate limit check — mirrors the Redis sliding window logic.
 *
 * @param {string} key        — Unique rate-limit key
 * @param {number} limit      — Max requests per window
 * @returns {{ currentCount: number, resetEpoch: number, remaining: number }}
 */
function inMemoryRateLimit(key, limit) {
  const currentMinute = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const resetEpoch    = (currentMinute + 1) * WINDOW_SECONDS;
  const storeKey      = `${key}:${currentMinute}`;

  const entry = memoryStore.get(storeKey) || { count: 0, resetAt: resetEpoch };
  entry.count += 1;
  entry.resetAt = resetEpoch;
  memoryStore.set(storeKey, entry);

  return {
    currentCount: entry.count,
    resetEpoch,
    remaining: Math.max(0, limit - entry.count),
  };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create the rate limiter middleware.
 *
 * Tries Redis first; falls back to in-memory if Redis is unavailable.
 * The fallback ensures we NEVER fail open — rate limiting is always active.
 *
 * @param {import('redis').RedisClientType} redisClient - Redis client
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(redisClient) {
  return async function rateLimiter(req, res, next) {
    // Must be called after apiKeyAuth (req.apiPartner is required)
    if (!req.apiPartner) {
      return next();
    }

    const limit    = req.apiPartner.rate_limit || DEFAULT_RATE_LIMIT;
    const keyBase  = `ratelimit:${req.apiPartner.id}`;

    let currentCount, resetEpoch, remaining;

    // ── Attempt Redis path ─────────────────────────────────────────────────
    if (redisClient && redisClient.isReady) {
      try {
        const currentMinute = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
        const redisKey = `${keyBase}:${currentMinute}`;

        const results = await redisClient
          .multi()
          .incr(redisKey)
          .expire(redisKey, WINDOW_SECONDS)
          .exec();

        currentCount = results[0];
        resetEpoch   = (currentMinute + 1) * WINDOW_SECONDS;
        remaining    = Math.max(0, limit - currentCount);
      } catch (redisErr) {
        console.warn('[rateLimiter] Redis error, switching to in-memory fallback:', redisErr.message);
        ({ currentCount, resetEpoch, remaining } = inMemoryRateLimit(keyBase, limit));
      }
    } else {
      // ── In-memory fallback (Redis unavailable) ───────────────────────────
      ({ currentCount, resetEpoch, remaining } = inMemoryRateLimit(keyBase, limit));
    }

    // ── Set standard rate-limit headers ───────────────────────────────────
    res.set('X-RateLimit-Limit',     String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset',     String(resetEpoch));

    if (currentCount > limit) {
      const retryAfter = Math.max(1, resetEpoch - Math.floor(Date.now() / 1000));
      res.set('Retry-After', String(retryAfter));

      return sendError(
        res,
        new ApiError(
          429,
          'RATE_LIMITED',
          `Rate limit of ${limit} requests per minute exceeded. Retry after ${retryAfter}s.`
        )
      );
    }

    next();
  };
}

module.exports = createRateLimiter;
