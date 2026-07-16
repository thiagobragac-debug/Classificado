/**
 * @file webhookVerifier.js
 * @description Cryptographically verifies incoming webhook payloads from all
 * supported payment gateways using HMAC-SHA256 signatures.
 *
 * Gateways supported:
 *   - Stripe        (stripe-signature header,     format: t=<ts>,v1=<hmac>)
 *   - Mercado Pago  (x-signature header,          format: ts=<ts>,v1=<hmac>)
 *   - Pagar.me      (x-hub-signature header,      format: sha256=<hmac>)
 *   - ASAAS         (asaas-access-token header,   format: plain token comparison)
 *
 * All verifications use constant-time comparison to prevent timing attacks.
 * Stripe and Mercado Pago also enforce a 5-minute replay-attack window.
 *
 * References:
 *   Stripe:       https://stripe.com/docs/webhooks/signatures
 *   Mercado Pago: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 *   Pagar.me:     https://docs.pagar.me/reference/webhooks-1
 *   ASAAS:        https://docs.asaas.com/reference/webhook
 */

'use strict';

const crypto = require('crypto');

/** Replay-attack prevention window in milliseconds (5 minutes). */
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Stripe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies the Stripe webhook signature.
 *
 * Stripe sends:
 *   stripe-signature: t=<timestamp>,v1=<hmac>[,v0=<legacy>]
 *
 * Signed payload: "<timestamp>.<raw_body_string>"
 *
 * @param {Buffer}  rawBody   — Raw (unparsed) request body
 * @param {string}  sigHeader — Value of the stripe-signature header
 * @param {string}  secret    — Webhook signing secret (whsec_...)
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyStripe(rawBody, sigHeader, secret) {
  if (!rawBody || !sigHeader || !secret) {
    return { valid: false, reason: 'Missing required components (body, header or secret)' };
  }

  const parts = parseKVHeader(sigHeader);
  const { t: ts, v1: receivedHash } = parts;

  if (!ts || !receivedHash) {
    return { valid: false, reason: 'Malformed stripe-signature header' };
  }

  if (!isTimestampFresh(ts)) {
    return { valid: false, reason: 'Timestamp expired — possible replay attack' };
  }

  const signedPayload  = `${ts}.${rawBody.toString('utf8')}`;
  const expectedHash   = hmacSha256Hex(secret, signedPayload);

  return safeCompare(expectedHash, receivedHash)
    ? { valid: true }
    : { valid: false, reason: 'HMAC signature mismatch' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mercado Pago
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies the Mercado Pago webhook signature.
 *
 * Mercado Pago sends:
 *   x-signature:  ts=<timestamp>,v1=<hmac>
 *   x-request-id: <uuid>
 *
 * Signed manifest: "id:<dataId>;request-id:<xRequestId>;ts:<ts>;"
 *
 * @param {string}  xSignature  — Value of the x-signature header
 * @param {string}  xRequestId  — Value of the x-request-id header
 * @param {string}  dataId      — Payment/resource ID from the payload body
 * @param {string}  secret      — Webhook secret from MP dashboard
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyMercadoPago(xSignature, xRequestId, dataId, secret) {
  if (!xSignature || !xRequestId || !dataId || !secret) {
    return { valid: false, reason: 'Missing required components (signature, requestId, dataId or secret)' };
  }

  const parts = parseKVHeader(xSignature);
  const { ts, v1: receivedHash } = parts;

  if (!ts || !receivedHash) {
    return { valid: false, reason: 'Malformed x-signature header' };
  }

  if (!isTimestampFresh(ts)) {
    return { valid: false, reason: 'Timestamp expired — possible replay attack' };
  }

  const manifest    = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expectedHash = hmacSha256Hex(secret, manifest);

  return safeCompare(expectedHash, receivedHash)
    ? { valid: true }
    : { valid: false, reason: 'HMAC signature mismatch' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagar.me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies the Pagar.me webhook signature.
 *
 * Pagar.me sends:
 *   x-hub-signature: sha256=<hmac>
 *
 * The HMAC is computed over the raw request body using the webhook secret.
 * Note: Pagar.me does not include a timestamp in the signature, so replay
 * attack prevention relies on idempotency keys handled at the business layer.
 *
 * @param {Buffer}  rawBody      — Raw (unparsed) request body
 * @param {string}  sigHeader    — Value of the x-hub-signature header
 * @param {string}  secret       — Webhook secret from Pagar.me dashboard
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyPagarme(rawBody, sigHeader, secret) {
  if (!rawBody || !sigHeader || !secret) {
    return { valid: false, reason: 'Missing required components (body, header or secret)' };
  }

  // Format: "sha256=<hex_digest>"
  const prefix = 'sha256=';
  if (!sigHeader.startsWith(prefix)) {
    return { valid: false, reason: 'Malformed x-hub-signature header (expected sha256= prefix)' };
  }

  const receivedHash = sigHeader.slice(prefix.length);
  const expectedHash = hmacSha256Hex(secret, rawBody.toString('utf8'));

  return safeCompare(expectedHash, receivedHash)
    ? { valid: true }
    : { valid: false, reason: 'HMAC signature mismatch' };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASAAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies the ASAAS webhook token.
 *
 * ASAAS sends:
 *   asaas-access-token: <token configured in ASAAS dashboard>
 *
 * Unlike Stripe/MP/Pagar.me, ASAAS does NOT use HMAC — it sends a plain
 * bearer-style token that must match ASAAS_WEBHOOK_TOKEN exactly.
 * Constant-time comparison is still used to prevent timing attacks.
 *
 * @param {Object} headers  — req.headers object
 * @param {string} [token]  — Optional override (e.g. from Supabase settings)
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyAsaas(headers, token) {
  const receivedToken = headers['asaas-access-token'];
  const secret        = token || process.env.ASAAS_WEBHOOK_TOKEN;

  if (!secret) {
    return { valid: false, reason: 'ASAAS_WEBHOOK_TOKEN not configured' };
  }
  if (!receivedToken) {
    return { valid: false, reason: 'Missing asaas-access-token header' };
  }

  return safeCompare(receivedToken, secret)
    ? { valid: true }
    : { valid: false, reason: 'ASAAS token mismatch' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway auto-detector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects the gateway from the request headers and runs the appropriate
 * verification. Uses gateway-specific secrets from environment variables,
 * falling back to the Supabase settings object if provided.
 *
 * Secret precedence: process.env → settings (Supabase)
 *
 * @param {Buffer}  rawBody  — Raw (unparsed) request body
 * @param {Object}  headers  — req.headers object
 * @param {Object}  payload  — Parsed JSON payload (for MP dataId)
 * @param {Object}  [settings] — Optional platform_settings from Supabase
 * @returns {{ valid: boolean, gateway?: string, reason?: string }}
 */
function verifyAnyGateway(rawBody, headers, payload, settings = {}) {
  const stripeHeader  = headers['stripe-signature'];
  const mpHeader      = headers['x-signature'];
  const pagarmeHeader = headers['x-hub-signature'];

  // ── Stripe ─────────────────────────────────────────────────────────────
  if (stripeHeader) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || settings.stripe_webhook_secret || process.env.WEBHOOK_SECRET;
    if (!secret) {
      return { valid: false, gateway: 'stripe', reason: 'STRIPE_WEBHOOK_SECRET not configured' };
    }
    const result = verifyStripe(rawBody, stripeHeader, secret);
    return { ...result, gateway: 'stripe' };
  }

  // ── Mercado Pago ───────────────────────────────────────────────────────
  if (mpHeader) {
    const secret     = process.env.MP_WEBHOOK_SECRET || settings.mp_webhook_secret || process.env.WEBHOOK_SECRET;
    const xRequestId = headers['x-request-id'] || '';
    const dataId     = String(payload?.data?.id || '');

    if (!secret) {
      return { valid: false, gateway: 'mercadopago', reason: 'MP_WEBHOOK_SECRET not configured' };
    }
    const result = verifyMercadoPago(mpHeader, xRequestId, dataId, secret);
    return { ...result, gateway: 'mercadopago' };
  }

  // ── Pagar.me ───────────────────────────────────────────────────────────
  if (pagarmeHeader) {
    const secret = process.env.PAGARME_WEBHOOK_SECRET || settings.pagarme_webhook_secret || process.env.WEBHOOK_SECRET;
    if (!secret) {
      return { valid: false, gateway: 'pagarme', reason: 'PAGARME_WEBHOOK_SECRET not configured' };
    }
    const result = verifyPagarme(rawBody, pagarmeHeader, secret);
    return { ...result, gateway: 'pagarme' };
  }

  // ── ASAAS ──────────────────────────────────────────────────────────────
  // ASAAS sends asaas-access-token header (plain token, no HMAC)
  if (headers['asaas-access-token']) {
    const token = process.env.ASAAS_WEBHOOK_TOKEN || settings.asaas_webhook_token;
    const result = verifyAsaas(headers, token);
    return { ...result, gateway: 'asaas' };
  }

  // ── No recognisable signature header ──────────────────────────────────
  return { valid: false, gateway: null, reason: 'No recognisable payment gateway signature header found' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a comma-separated key=value header (e.g. "t=123,v1=abc").
 * @param {string} header
 * @returns {Object<string, string>}
 */
function parseKVHeader(header) {
  const result = {};
  header.split(',').forEach(part => {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      result[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  });
  return result;
}

/**
 * Returns true if the Unix timestamp (seconds) is within the replay window.
 * @param {string|number} ts — Unix timestamp in seconds
 * @returns {boolean}
 */
function isTimestampFresh(ts) {
  const tsMs = parseInt(ts, 10) * 1000;
  return !isNaN(tsMs) && Math.abs(Date.now() - tsMs) <= REPLAY_WINDOW_MS;
}

/**
 * Computes HMAC-SHA256 over a message using the given secret.
 * @param {string} secret
 * @param {string} message
 * @returns {string} — hex digest
 */
function hmacSha256Hex(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Constant-time string comparison — prevents timing-based attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  verifyStripe,
  verifyMercadoPago,
  verifyPagarme,
  verifyAsaas,
  verifyAnyGateway,
};
