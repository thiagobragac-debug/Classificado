#!/usr/bin/env node

/**
 * @file generateApiKey.js
 * @description CLI utility to generate new API keys for Tauze Class partners.
 *
 * Usage:
 *   node api/utils/generateApiKey.js \
 *     --partner "Acme Corp" \
 *     --email "dev@acme.com" \
 *     --permissions "read,write" \
 *     --rate-limit 200 \
 *     --env production
 *
 * Options:
 *   --partner      (required) Partner / company name
 *   --email        (required) Contact e-mail for the partner
 *   --permissions  Comma-separated permissions (default: "read")
 *   --rate-limit   Requests per minute       (default: 100)
 *   --env          "production" or "development" (default: "production")
 *
 * The generated plaintext key is printed ONCE and is NOT stored.
 * Only the bcrypt hash (secret_hash) is persisted in the database.
 */

'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Lazy-require bcrypt – try native first, then fallback to bcryptjs
// ---------------------------------------------------------------------------

/** @type {{ hash: (data: string, rounds: number) => Promise<string> }} */
let bcryptLib;
try {
  bcryptLib = require('bcrypt');
} catch (_) {
  try {
    bcryptLib = require('bcryptjs');
  } catch (__) {
    console.error(
      '❌  Neither "bcrypt" nor "bcryptjs" is installed.\n' +
      '   Run: npm install bcrypt   (or npm install bcryptjs)\n'
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing (simple, no external deps)
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into a key/value map.
 * Supports `--key value` pairs.
 *
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  // --- Validate required args ---
  if (!args.partner) {
    console.error('❌  Missing required argument: --partner <name>');
    process.exit(1);
  }
  if (!args.email) {
    console.error('❌  Missing required argument: --email <email>');
    process.exit(1);
  }

  const partnerName = args.partner;
  const contactEmail = args.email;
  const permissions = args.permissions || 'read';
  const rateLimit = parseInt(args['rate-limit'], 10) || 100;
  const environment = args.env === 'development' ? 'development' : 'production';

  // --- Generate the API key ---
  const prefix = environment === 'production' ? 'tc_prod_' : 'tc_dev_';
  const randomHex = crypto.randomBytes(20).toString('hex'); // 40 hex chars
  const apiKey = `${prefix}${randomHex}`;

  // --- Hash the key ---
  const BCRYPT_ROUNDS = 10;
  const secretHash = await bcryptLib.hash(apiKey, BCRYPT_ROUNDS);
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // --- Insert into Supabase ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      secret_hash: secretHash,
      key_hash: keyHash,
      partner_name: partnerName,
      email: contactEmail,
      permissions: permissions,
      rate_limit: rateLimit,
      environment: environment,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('❌  Failed to insert API key:', error.message);
    process.exit(1);
  }

  // --- Print result ---
  console.log('\n============================================================');
  console.log('  ✅  API Key Generated Successfully');
  console.log('============================================================');
  console.log(`  Partner:      ${partnerName}`);
  console.log(`  Email:        ${contactEmail}`);
  console.log(`  Permissions:  ${permissions}`);
  console.log(`  Rate Limit:   ${rateLimit} req/min`);
  console.log(`  Environment:  ${environment}`);
  console.log(`  DB Record ID: ${data.id}`);
  console.log('------------------------------------------------------------');
  console.log(`  🔑  API KEY:  ${apiKey}`);
  console.log('------------------------------------------------------------');
  console.log('  ⚠️   Save this key NOW. It will NOT be shown again.');
  console.log('============================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
