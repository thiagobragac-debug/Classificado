/**
 * @file requestLogger.js
 * @description Express middleware that logs every API request to the
 * `api_request_logs` Supabase table. Logging is fully asynchronous and
 * never blocks or throws errors into the request pipeline.
 */

'use strict';

/**
 * Create the request logger middleware.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {import('express').RequestHandler}
 */
function createRequestLogger(supabase) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function requestLogger(req, res, next) {
    const startTime = Date.now();

    res.on('finish', () => {
      // Build the log entry – never throw
      try {
        const durationMs = Date.now() - startTime;

        /** @type {Object} */
        const logEntry = {
          method: req.method,
          endpoint: req.originalUrl || req.url,
          status: res.statusCode,
          ip_address: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
          user_agent: req.headers['user-agent'] || null,
          duration_ms: durationMs
        };

        // Attach api_key_id when available (set by apiKeyAuth middleware)
        if (req.apiPartner && req.apiPartner.id) {
          logEntry.api_key_id = req.apiPartner.id;
        }

        // Fire-and-forget insert
        supabase
          .from('api_request_logs')
          .insert(logEntry)
          .then(({ error }) => {
            if (error) {
              console.warn('[requestLogger] Failed to insert log:', error.message);
            }
          })
          .catch((err) => {
            console.warn('[requestLogger] Insert error:', err.message);
          });
      } catch (err) {
        // Absolutely never propagate errors from logging
        console.warn('[requestLogger] Unexpected error:', err.message);
      }
    });

    next();
  };
}

module.exports = createRequestLogger;
