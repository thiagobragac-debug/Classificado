/**
 * @file securityHeaders.js
 * @description Express middleware that applies a comprehensive set of HTTP
 * security headers to every response, protecting against XSS, clickjacking,
 * MIME sniffing and information leakage.
 */

'use strict';

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Returns an Express middleware that sets security headers on every response.
 * @returns {import('express').RequestHandler}
 */
function securityHeaders() {
  return function securityHeadersMiddleware(req, res, next) {
    // ── Prevent clickjacking ───────────────────────────────────────────────
    res.setHeader('X-Frame-Options', 'DENY');

    // ── Prevent MIME-type sniffing ─────────────────────────────────────────
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ── Force HTTPS (HSTS) — 1 year, include subdomains ───────────────────
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // ── Disable browser features we don't need ─────────────────────────────
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(self)'
    );

    // ── Referrer policy ────────────────────────────────────────────────────
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ── Content Security Policy ────────────────────────────────────────────
    // This is a backend API — browsers should never render HTML from here.
    // For the static frontend (served separately), CSP must be set there too.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );

    // ── Remove fingerprinting headers ──────────────────────────────────────
    res.removeHeader('X-Powered-By');

    next();
  };
}

module.exports = securityHeaders;
