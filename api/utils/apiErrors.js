/**
 * @file apiErrors.js
 * @description Standard error response utility for the Tauze Class REST API.
 * Provides a consistent error/success envelope for all API responses.
 */

'use strict';

/**
 * Custom API error class with HTTP status, machine-readable code, and human message.
 * @extends Error
 */
class ApiError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} code   - Machine-readable error code (e.g. "UNAUTHORIZED")
   * @param {string} message - Human-readable error message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Predefined errors
// ---------------------------------------------------------------------------

/** @type {ApiError} 401 – Missing or invalid authentication */
const UNAUTHORIZED = new ApiError(401, 'UNAUTHORIZED', 'Authentication required. Provide a valid API key.');

/** @type {ApiError} 403 – Authenticated but not allowed */
const FORBIDDEN = new ApiError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');

/** @type {ApiError} 404 – Resource does not exist */
const NOT_FOUND = new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');

/** @type {ApiError} 429 – Too many requests */
const RATE_LIMITED = new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded. Please slow down your requests.');

/** @type {ApiError} 400 – Bad request / validation failure */
const VALIDATION_ERROR = new ApiError(400, 'VALIDATION_ERROR', 'The request contains invalid or missing parameters.');

/** @type {ApiError} 500 – Unexpected server error */
const INTERNAL_ERROR = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected internal error occurred.');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send a standardised error response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {ApiError|Error} error - Error to serialise. If it is not an ApiError
 *   the response defaults to a generic 500.
 * @returns {void}
 */
function sendError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof ApiError
    ? error.message
    : 'An unexpected internal error occurred.';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      status
    }
  });
}

/**
 * Send a standardised success response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Payload to return under the `data` key
 * @param {Object} [pagination] - Optional pagination metadata
 * @param {number} [pagination.page]
 * @param {number} [pagination.per_page]
 * @param {number} [pagination.total]
 * @param {number} [pagination.total_pages]
 * @param {Object} [rateLimit] - Optional rate-limit metadata
 * @param {number} [rateLimit.limit]
 * @param {number} [rateLimit.remaining]
 * @param {number} [rateLimit.reset]
 * @returns {void}
 */
function sendSuccess(res, data, pagination, rateLimit) {
  const body = { success: true, data };

  if (pagination) {
    body.pagination = pagination;
  }
  if (rateLimit) {
    body.rate_limit = rateLimit;
  }

  res.json(body);
}

// ---------------------------------------------------------------------------
// Express error-handling middleware (must have 4 params)
// ---------------------------------------------------------------------------

/**
 * Global Express error handler.
 * Catches any error thrown or passed via `next(err)` and returns a JSON
 * response using the standard envelope.
 *
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, _req, res, _next) {
  // Avoid double-sending if headers were already flushed
  if (res.headersSent) {
    return;
  }

  // Log unexpected (non-ApiError) errors for debugging
  if (!(err instanceof ApiError)) {
    console.error('[API] Unhandled error:', err);
  }

  sendError(res, err);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ApiError,
  errorHandler,
  sendError,
  sendSuccess,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  RATE_LIMITED,
  VALIDATION_ERROR,
  INTERNAL_ERROR
};
