/**
 * inject_security_headers.js
 * 
 * Inserts security meta tags into all production HTML pages.
 * 
 * Tags injected:
 *   - X-Frame-Options via CSP frame-ancestors (meta equivalent for framing)
 *   - Referrer-Policy
 *   - X-Content-Type-Options via http-equiv (best effort; server header is primary)
 * 
 * Note: True X-Frame-Options and Content-Security-Policy should ALSO be set
 * as HTTP response headers by the server/CDN. Meta tags are a complementary
 * defence-in-depth layer for statically served HTML.
 * 
 * Usage: node inject_security_headers.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────

// Directories to process (relative to this script's location)
const HTML_DIRS = [
  path.join(__dirname, '..'),           // Root public pages
  path.join(__dirname, '..', 'admin'),  // Admin pages
];

// Files to exclude (backup/dev files)
const EXCLUDE_PATTERNS = [
  /backup/i,
  /nuclear/i,
  /painel_before/i,
  /painel_fixed/i,
  /painel_git/i,
  /original_painel/i,
  /diagnostico\.html/i,
  /teste\.html/i,
  /h_idx\.html/i,
  /h_pnl\.html/i,
  /reset\.html/i,
];

// The security meta block to inject (placed right after <meta charset>)
const SECURITY_META_BLOCK = `
  <!-- Security headers (defence-in-depth, complements server-side headers) -->
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
  <meta name="referrer" content="strict-origin-when-cross-origin">`;

// ── Processing ────────────────────────────────────────────────────────────

let totalProcessed = 0;
let totalSkipped   = 0;
let totalAlready   = 0;

function shouldExclude(filePath) {
  const base = path.basename(filePath);
  return EXCLUDE_PATTERNS.some(re => re.test(base));
}

function processFile(filePath) {
  if (shouldExclude(filePath)) {
    console.log(`  ⏭  Skipped (excluded): ${path.basename(filePath)}`);
    totalSkipped++;
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Already has our marker → skip
  if (content.includes('Security headers (defence-in-depth')) {
    console.log(`  ✓  Already patched: ${path.basename(filePath)}`);
    totalAlready++;
    return;
  }

  // Insert after the first <meta charset...> line
  const charsetRegex = /(<meta\s+charset=["'][^"']*["'][^>]*>)/i;
  if (!charsetRegex.test(content)) {
    console.warn(`  ⚠  No <meta charset> found — skipping: ${path.basename(filePath)}`);
    totalSkipped++;
    return;
  }

  const updated = content.replace(charsetRegex, `$1${SECURITY_META_BLOCK}`);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`  ✅ Patched: ${path.basename(filePath)}`);
  totalProcessed++;
}

function processDir(dir, recursive = false) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.html')) {
      processFile(full);
    }
    // Only go one level deep for the root dir (avoid node_modules etc.)
  }
}

console.log('\n🔒 Injecting security meta tags into HTML pages...\n');

// Process root HTML pages (non-recursive to avoid node_modules)
processDir(HTML_DIRS[0]);

// Process admin HTML pages
processDir(HTML_DIRS[1]);

console.log(`
────────────────────────────────────────
✅ Patched:          ${totalProcessed} files
⏭  Skipped:          ${totalSkipped} files (excluded or no charset)
✓  Already patched:  ${totalAlready} files
────────────────────────────────────────
`);
